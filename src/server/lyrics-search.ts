import type { Database } from "bun:sqlite";
import type { Lyrics } from "../shared/lyrics";
import { editDistance, normalize } from "../shared/normalize";
import type { LyricsHit } from "../shared/search";

/*
 * Search by half-remembered words. One FTS5 row per song (rowid = the `lyrics` cache row), holding the normalized
 * lyrics, so "dont" finds "don't" and phrases can cross line breaks. Misspelled words are corrected against the
 * index's own vocabulary instead of a trigram index, which would be several times the size of the lyrics.
 */

const VOCAB_TTL_MS = 60_000;

export function createLyricsSearchTables(db: Database): void {
  db.run(`create virtual table if not exists lyrics_fts using fts5(text, tokenize = "unicode61 remove_diacritics 2")`);
  db.run("create virtual table if not exists lyrics_vocab using fts5vocab(lyrics_fts, 'row')");
  // Lyrics cached before this table existed.
  const indexed = db.query<{ n: number }, []>("select count(*) as n from lyrics_fts").get()?.n ?? 0;
  if (indexed) return;
  const rows = db.query<{ rowid: number; body: string }, []>("select rowid, body from lyrics where status in ('synced', 'plain')").all();
  db.transaction(() => {
    for (const row of rows) indexLyrics(db, row.rowid, JSON.parse(row.body) as Lyrics);
  })();
}

/** (Re)index one cached lyrics row; nothing for misses and instrumentals. */
export function indexLyrics(db: Database, rowid: number, lyrics: Lyrics): void {
  db.query("delete from lyrics_fts where rowid = ?").run(rowid);
  const text = lyrics.lines.map((line) => normalize(line.text)).join(" ");
  if (text.trim()) db.query("insert into lyrics_fts (rowid, text) values (?, ?)").run(rowid, text);
}

export function unindexLyrics(db: Database, rowid: number): void {
  db.query("delete from lyrics_fts where rowid = ?").run(rowid);
}

const vocabularies = new WeakMap<Database, { at: number; terms: string[] }>();

/** Close spellings of `term` that the lyrics actually contain ("dreamin" → "dreaming", "lonley" → "lonely"). */
function corrections(db: Database, term: string, now: number): string[] {
  if (term.length < 3) return [];
  let vocab = vocabularies.get(db);
  if (!vocab || now - vocab.at > VOCAB_TTL_MS) {
    vocab = {
      at: now,
      terms: db
        .query<{ term: string }, []>("select term from lyrics_vocab")
        .all()
        .map((row) => row.term),
    };
    vocabularies.set(db, vocab);
  }
  // One slip in a short word, two in a longer one: beyond that a "correction" is just another word.
  const max = term.length <= 5 ? 1 : 2;
  return vocab.terms
    .map((candidate) => ({ candidate, distance: editDistance(term, candidate, max) }))
    .filter(({ distance }) => distance <= max)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6)
    .map(({ candidate }) => candidate);
}

const quote = (term: string) => `"${term.replace(/"/g, "")}"`;

/** Words of `line` (with their position in it) that match one of `terms`, as [start, end) ranges. */
function highlights(line: string, terms: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const word of line.matchAll(/[\p{L}\p{N}'’]+/gu)) {
    const plain = normalize(word[0]).replace(/\s+/g, "");
    if (plain && terms.some((term) => plain.startsWith(term))) ranges.push([word.index, word.index + word[0].length]);
  }
  return ranges;
}

/**
 * The line a match starts on: most words on it and the next line together (phrases cross line breaks), then the
 * line holding the first word, then most words on the line alone.
 */
function bestLine(lines: string[], terms: string[]): number {
  const words = lines.map((line) => normalize(line).split(" "));
  const found = (index: number) => new Set(terms.filter((term) => words[index]?.some((word) => word.startsWith(term))));
  const score = (index: number) => {
    const own = found(index);
    const both = new Set([...own, ...found(index + 1)]);
    return [both.size, terms[0] && own.has(terms[0]) ? 1 : 0, own.size];
  };
  let best = 0;
  let bestScore = [-1, -1, -1];
  for (let index = 0; index < lines.length; index += 1) {
    const current = score(index);
    const better = current.findIndex((value, at) => value !== bestScore[at]);
    if (better >= 0 && (current[better] ?? 0) > (bestScore[better] ?? 0)) {
      best = index;
      bestScore = current;
    }
  }
  return best;
}

/**
 * Songs whose lyrics match, best first: the exact phrase, then the words close together, then all the words
 * anywhere, then with misspellings corrected. Each hit carries the matching line with one line of context.
 */
export function queryLyrics(
  db: Database,
  server: string,
  text: string,
  limit: number,
  folders: string[] | null,
  now: number = Date.now(),
): LyricsHit[] {
  const terms = normalize(text).split(" ").filter(Boolean);
  if (!terms.length) return [];
  const last = terms.length - 1;
  const words = terms.map((term, index) => (index === last ? `${quote(term)}*` : quote(term)));
  // Corrections scan the whole vocabulary, so only when the exact words didn't find enough.
  const fixed = () =>
    terms
      .map((term) => `(${[term, ...corrections(db, term, now).filter((candidate) => candidate !== term)].map(quote).join(" OR ")})`)
      .join(" AND ");
  const tiers = [
    () => `"${terms.join(" ")}"*`,
    () => (terms.length > 1 ? `NEAR(${words.join(" ")}, 4)` : null),
    () => words.join(" AND "),
    fixed,
  ];

  const hits = new Map<string, LyricsHit>();
  const song = db.query<{ folder: string; data: string }, [string, string]>(
    "select folder, data from idx_items where server = ? and kind = 'song' and id = ?",
  );
  for (const tier of tiers) {
    if (hits.size >= limit) break;
    const match = tier();
    if (!match) continue;
    const rows = db
      .query<{ key: string; body: string }, [string, string]>(
        `select l.song_id as key, l.body from lyrics_fts f join lyrics l on l.rowid = f.rowid
         where lyrics_fts match ? and l.song_id like ? order by f.rank limit 100`,
      )
      .all(match, `${server}:%`);
    for (const row of rows) {
      const id = row.key.slice(server.length + 1);
      const indexed = song.get(server, id);
      if (hits.has(id) || !indexed || (folders && !folders.includes(indexed.folder))) continue;
      const lyrics = JSON.parse(row.body) as Lyrics;
      const lines = lyrics.lines.map((line) => line.text);
      const wanted = [...new Set(match.match(/"[^"]+"/g)?.flatMap((phrase) => phrase.slice(1, -1).split(" ")) ?? terms)];
      const index = bestLine(lines, wanted);
      hits.set(id, {
        song: JSON.parse(indexed.data),
        line: index,
        start: lyrics.status === "synced" ? (lyrics.lines[index]?.start ?? 0) : null,
        before: lines[index - 1] ?? "",
        text: lines[index] ?? "",
        after: lines[index + 1] ?? "",
        highlights: highlights(lines[index] ?? "", wanted),
      });
      if (hits.size >= limit) break;
    }
  }
  return [...hits.values()];
}

/** How far lyrics have been looked up on `server`: songs with an answer cached (found or not) out of all songs. */
export function lyricsCoverage(db: Database, server: string): { checked: number; total: number } {
  const checked = db.query<{ n: number }, [string]>("select count(*) as n from lyrics where song_id like ?").get(`${server}:%`)?.n ?? 0;
  const total =
    db.query<{ n: number }, [string]>("select count(*) as n from idx_items where server = ? and kind = 'song'").get(server)?.n ?? 0;
  return { checked: Math.min(checked, total), total };
}
