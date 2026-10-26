import type { Database } from "bun:sqlite";
import type { Lyrics } from "@keep/shared/lyrics";
import { editDistance, normalize } from "@keep/shared/normalize";
import type { LyricsHit } from "@keep/shared/search";

// Misspellings are corrected against the index's own vocabulary; a trigram index would be several times the lyrics' size.

export function createLyricsSearchTables(db: Database): void {
  db.run(`create virtual table if not exists lyrics_fts using fts5(text, tokenize = "unicode61 remove_diacritics 2")`);
  db.run("create virtual table if not exists lyrics_vocab using fts5vocab(lyrics_fts, 'row')");
  const indexed = db.query<{ n: number }, []>("select count(*) as n from lyrics_fts").get()?.n ?? 0;
  if (indexed) return;
  const rows = db.query<{ rowid: number; body: string }, []>("select rowid, body from lyrics where status in ('synced', 'plain')").all();
  db.transaction(() => {
    for (const row of rows) indexLyrics(db, row.rowid, JSON.parse(row.body) as Lyrics);
  })();
}

const vocabularies = new WeakMap<Database, Set<string>>();

export function indexLyrics(db: Database, rowid: number, lyrics: Lyrics): void {
  db.query("delete from lyrics_fts where rowid = ?").run(rowid);
  const text = lyrics.lines.map((line) => normalize(line.text)).join(" ");
  if (!text.trim()) return;
  db.query("insert into lyrics_fts (rowid, text) values (?, ?)").run(rowid, text);
  const vocab = vocabularies.get(db);
  if (vocab) for (const word of text.split(" ")) if (word) vocab.add(word);
}

export function unindexLyrics(db: Database, rowid: number): void {
  db.query("delete from lyrics_fts where rowid = ?").run(rowid);
}

function corrections(db: Database, term: string): string[] {
  if (term.length < 3) return [];
  let vocab = vocabularies.get(db);
  if (!vocab) {
    vocab = new Set(
      db
        .query<{ term: string }, []>("select term from lyrics_vocab")
        .all()
        .map((row) => row.term),
    );
    vocabularies.set(db, vocab);
  }
  // One slip in a short word, two in a longer one: beyond that a "correction" is just another word.
  const max = term.length <= 5 ? 1 : 2;
  return [...vocab]
    .map((candidate) => ({ candidate, distance: editDistance(term, candidate, max) }))
    .filter(({ distance }) => distance <= max)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6)
    .map(({ candidate }) => candidate);
}

function distanceTo(line: string, terms: string[]): number {
  const words = normalize(line).split(" ");
  return terms.reduce(
    (total, term) => total + Math.min(3, ...words.map((word) => (word.startsWith(term) ? 0 : editDistance(term, word, 2)))),
    0,
  );
}

const quote = (term: string) => `"${term.replace(/"/g, "")}"`;

function highlights(line: string, terms: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const word of line.matchAll(/[\p{L}\p{N}'’]+/gu)) {
    const plain = normalize(word[0]).replace(/\s+/g, "");
    if (plain && terms.some((term) => plain.startsWith(term))) ranges.push([word.index, word.index + word[0].length]);
  }
  return ranges;
}

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

export function queryLyrics(db: Database, server: string, text: string, limit: number, folders: string[] | null): LyricsHit[] {
  const terms = normalize(text).split(" ").filter(Boolean);
  if (!terms.length) return [];
  const last = terms.length - 1;
  const words = terms.map((term, index) => (index === last ? `${quote(term)}*` : quote(term)));
  // Corrections scan the whole vocabulary, so only when the exact words didn't find enough.
  const fixed = () =>
    terms
      .map((term) => `(${[term, ...corrections(db, term).filter((candidate) => candidate !== term)].map(quote).join(" OR ")})`)
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
    const found: (LyricsHit & { id: string; cost: number })[] = [];
    for (const row of rows) {
      const id = row.key.slice(server.length + 1);
      const indexed = song.get(server, id);
      if (hits.has(id) || !indexed || (folders && !folders.includes(indexed.folder))) continue;
      const lyrics = JSON.parse(row.body) as Lyrics;
      const lines = lyrics.lines.map((line) => line.text);
      const wanted = [...new Set(match.match(/"[^"]+"/g)?.flatMap((phrase) => phrase.slice(1, -1).split(" ")) ?? terms)];
      const index = bestLine(lines, wanted);
      found.push({
        id,
        cost: distanceTo(lines[index] ?? "", terms),
        song: JSON.parse(indexed.data),
        line: index,
        start: lyrics.status === "synced" ? (lyrics.lines[index]?.start ?? 0) : null,
        before: lines[index - 1] ?? "",
        text: lines[index] ?? "",
        after: lines[index + 1] ?? "",
        highlights: highlights(lines[index] ?? "", wanted),
      });
    }
    // Closest to what was typed first (one swapped letter beats a different word), then bm25.
    for (const { id, cost: _cost, ...hit } of found.sort((a, b) => a.cost - b.cost)) {
      if (hits.size >= limit) break;
      hits.set(id, hit);
    }
  }
  return [...hits.values()];
}

export function lyricsCoverage(db: Database, server: string): { checked: number; total: number } {
  const checked = db.query<{ n: number }, [string]>("select count(*) as n from lyrics where song_id like ?").get(`${server}:%`)?.n ?? 0;
  const total =
    db.query<{ n: number }, [string]>("select count(*) as n from idx_items where server = ? and kind = 'song'").get(server)?.n ?? 0;
  return { checked: Math.min(checked, total), total };
}
