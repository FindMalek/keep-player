import type { Database } from "bun:sqlite";
import { normalize, similarity } from "../shared/normalize";
import type { IndexStatus } from "../shared/search";
import type { Upstream } from "./config";
import { type Credentials, subsonic } from "./subsonic";

/*
 * The library search index, in library.db. Navidrome's search is a word prefix match; this adds typo tolerance,
 * substrings ("okcomputer"), accent folding and ranking, and lyrics search on top (#32). Built in the background as
 * the service account, per music folder, so results can be limited to the folders each user may see.
 */

const PAGE = 500;
const CHECK_MS = 5 * 60_000;
const WAIT_FOR_ACCOUNT_MS = 30_000;
/** A full rebuild at least once a day catches deletions Navidrome's scan time alone doesn't reveal. */
const RECONCILE_MS = 24 * 3_600_000;

export type Kind = "song" | "album" | "artist";

export function createIndexTables(db: Database): void {
  // Upserted (never replaced) so an item keeps its rowid, which the full-text tables share.
  db.run(`create table if not exists idx_items (
    server text not null,
    kind text not null,
    id text not null,
    folder text not null,
    name text not null,
    norm text not null,
    plays integer not null default 0,
    data text not null,
    generation integer not null,
    unique (server, kind, id)
  )`);
  db.run("create index if not exists idx_items_norm on idx_items (server, kind, norm)");
  db.run(`create virtual table if not exists fts_words using fts5(text, tokenize = "unicode61 remove_diacritics 2")`);
  db.run(`create virtual table if not exists fts_trigram using fts5(text, tokenize = "trigram")`);
  db.run("create table if not exists meta (key text primary key, value text not null)");
}

const searchText: Record<Kind, (data: Record<string, unknown>) => string> = {
  song: (song) => [song.title, song.artist, song.album].filter(Boolean).join(" "),
  album: (album) => [album.name, album.artist].filter(Boolean).join(" "),
  artist: (artist) => String(artist.name ?? ""),
};

/** Index one item (insert or update), in both full-text tables. */
function put(db: Database, server: string, kind: Kind, folder: string, data: Record<string, unknown>, generation: number): void {
  const name = String(kind === "song" ? data.title : data.name);
  const text = normalize(searchText[kind](data));
  const row = db
    .query<{ rowid: number }, [string, Kind, string, string, string, string, number, string, number]>(
      `insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (server, kind, id) do update set folder = excluded.folder, name = excluded.name, norm = excluded.norm,
         plays = excluded.plays, data = excluded.data, generation = excluded.generation
       returning rowid`,
    )
    .get(server, kind, String(data.id), folder, name, normalize(name), Number(data.playCount ?? 0), JSON.stringify(data), generation);
  if (!row) return;
  db.query("insert or replace into fts_words (rowid, text) values (?, ?)").run(row.rowid, text);
  // With and without spaces, so "okcomputer" finds "ok computer".
  db.query("insert or replace into fts_trigram (rowid, text) values (?, ?)").run(row.rowid, `${text} ${text.replace(/\s+/g, "")}`);
}

function meta(db: Database, key: string): string | undefined {
  return db.query<{ value: string }, [string]>("select value from meta where key = ?").get(key)?.value;
}

function setMeta(db: Database, key: string, value: string): void {
  db.query("insert or replace into meta (key, value) values (?, ?)").run(key, value);
}

type Item = Record<string, unknown>;

/**
 * Keeps one server's index in step with Navidrome: a full pass after each library scan (cheap: a few hundred pages
 * of `search3` even for big libraries) and at least once a day, which also drops whatever was deleted.
 */
export class IndexSync {
  private building = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly db: Database,
    private readonly upstream: Upstream,
    private readonly account: () => Credentials | null,
    private readonly now: () => number = Date.now,
  ) {
    createIndexTables(db);
  }

  private key(name: string): string {
    return `index-${name}:${this.upstream.id}`;
  }

  start(): void {
    const loop = async () => {
      await this.check().catch(() => undefined);
      // Until an admin signs in (or INDEX_USER is set) there is no account to index as: look again soon.
      this.timer = setTimeout(loop, this.account() ? CHECK_MS : WAIT_FOR_ACCOUNT_MS);
      this.timer.unref?.();
    };
    this.timer = setTimeout(loop, 3000);
    this.timer.unref?.();
  }

  stop(): void {
    clearTimeout(this.timer);
  }

  status(): IndexStatus {
    const count = (kind: Kind) =>
      this.db
        .query<{ n: number }, [string, Kind]>("select count(*) as n from idx_items where server = ? and kind = ?")
        .get(this.upstream.id, kind)?.n ?? 0;
    const last = meta(this.db, this.key("last-sync"));
    return {
      songs: count("song"),
      albums: count("album"),
      artists: count("artist"),
      lastSync: last ? Number(last) : null,
      building: this.building,
    };
  }

  /** Rebuild when Navidrome scanned since the last pass, or that pass is a day old. */
  async check(): Promise<void> {
    const credentials = this.account();
    if (!credentials) return;
    const scan = await subsonic<{ scanStatus: { lastScan?: string; scanning?: boolean } }>(this.upstream, credentials, "getScanStatus");
    if (!scan || scan.scanStatus.scanning) return;
    const lastScan = scan.scanStatus.lastScan ?? "";
    const lastSync = Number(meta(this.db, this.key("last-sync")) ?? 0);
    if (lastScan === meta(this.db, this.key("last-scan")) && this.now() - lastSync < RECONCILE_MS) return;
    if (await this.rebuild()) setMeta(this.db, this.key("last-scan"), lastScan);
  }

  /** Page through every folder's songs, albums and artists; whatever this pass didn't see is deleted. */
  async rebuild(): Promise<boolean> {
    const credentials = this.account();
    if (!credentials || this.building) return false;
    this.building = true;
    try {
      const server = this.upstream.id;
      const generation = Number(meta(this.db, this.key("generation")) ?? 0) + 1;
      const folders = await subsonic<{ musicFolders: { musicFolder?: { id: number | string }[] } }>(
        this.upstream,
        credentials,
        "getMusicFolders",
      );
      if (!folders) return false;
      for (const folder of folders.musicFolders.musicFolder ?? []) {
        const folderId = String(folder.id);
        for (const kind of ["song", "album", "artist"] as const) {
          for (let offset = 0; ; offset += PAGE) {
            const page = await subsonic<{ searchResult3: Partial<Record<Kind, Item[]>> }>(this.upstream, credentials, "search3", {
              query: "",
              musicFolderId: folderId,
              songCount: 0,
              albumCount: 0,
              artistCount: 0,
              [`${kind}Count`]: PAGE,
              [`${kind}Offset`]: offset,
            });
            if (!page) return false;
            const items = page.searchResult3[kind] ?? [];
            this.db.transaction(() => {
              for (const item of items) put(this.db, server, kind, folderId, item, generation);
            })();
            if (items.length < PAGE) break;
          }
        }
      }
      this.db.transaction(() => {
        const gone = "select rowid from idx_items where server = ? and generation < ?";
        this.db.query(`delete from fts_words where rowid in (${gone})`).run(server, generation);
        this.db.query(`delete from fts_trigram where rowid in (${gone})`).run(server, generation);
        this.db.query("delete from idx_items where server = ? and generation < ?").run(server, generation);
        setMeta(this.db, this.key("generation"), String(generation));
        setMeta(this.db, this.key("last-sync"), String(this.now()));
      })();
      return true;
    } finally {
      this.building = false;
    }
  }
}

export interface Hit {
  kind: Kind;
  id: string;
  /** Lower is better: 0 exact, 1 prefix, 2 words, 3 typo-tolerant. */
  tier: number;
  score: number;
  data: Item;
}

/** Free text as an FTS5 query matching every word as a prefix: `"ok"* "comp"*`. */
function wordsQuery(query: string): string {
  return query
    .split(" ")
    .filter(Boolean)
    .map((word) => `"${word.replace(/"/g, "")}"*`)
    .join(" ");
}

type Row = { id: string; folder: string; name: string; data: string; plays: number };

/**
 * Ranked matches of one kind on one server: exact name, then name prefix, then every word (bm25), then typo-tolerant
 * trigram similarity; plays break ties. `folders` limits results to the music folders the user may see.
 */
export function queryIndex(db: Database, server: string, text: string, kind: Kind, limit: number, folders: string[] | null): Hit[] {
  const query = normalize(text);
  if (!query) return [];
  const hits = new Map<string, Hit>();
  const add = (row: Row, tier: number, score: number) => {
    if ((folders && !folders.includes(row.folder)) || (hits.get(row.id)?.tier ?? 9) <= tier) return;
    hits.set(row.id, { kind, id: row.id, tier, score: score - Math.log1p(row.plays) * 0.1, data: JSON.parse(row.data) });
  };
  const columns = "i.id, i.folder, i.name, i.data, i.plays";

  for (const row of db
    .query<Row, [string, Kind, string]>(`select ${columns} from idx_items i where server = ? and kind = ? and norm = ? limit 50`)
    .all(server, kind, query))
    add(row, 0, 0);
  for (const row of db
    .query<Row, [string, Kind, string]>(`select ${columns} from idx_items i where server = ? and kind = ? and norm like ? limit 100`)
    // Normalized text is letters, digits and spaces only, so nothing to escape.
    .all(server, kind, `${query}%`))
    add(row, 1, 0);
  for (const row of db
    .query<Row & { rank: number }, [string, string, Kind]>(
      `select ${columns}, f.rank from fts_words f join idx_items i on i.rowid = f.rowid
       where fts_words match ? and i.server = ? and i.kind = ? order by f.rank limit 200`,
    )
    .all(wordsQuery(query), server, kind))
    add(row, 2, row.rank);

  // Typos: anything sharing a trigram with the query, kept when it has most of the query's trigrams.
  const compact = query.replace(/\s+/g, "");
  if (hits.size < limit && compact.length >= 3) {
    const grams = new Set<string>();
    for (let index = 0; index + 3 <= compact.length; index += 1) grams.add(compact.slice(index, index + 3));
    const match = [...grams].map((gram) => `"${gram.replace(/"/g, "")}"`).join(" OR ");
    for (const row of db
      .query<Row & { text: string }, [string, string, Kind]>(
        `select ${columns}, f.text from fts_trigram f join idx_items i on i.rowid = f.rowid
         where fts_trigram match ? and i.server = ? and i.kind = ? order by f.rank limit 300`,
      )
      .all(match, server, kind)) {
      // Against everything indexed (title, artist, album), so "radiohed" finds Radiohead's songs too.
      const score = similarity(query, row.text);
      if (score >= 0.5) add(row, 3, -score);
    }
  }
  return [...hits.values()].sort((a, b) => a.tier - b.tier || a.score - b.score).slice(0, limit);
}
