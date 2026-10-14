import type { Database } from "bun:sqlite";
import { normalize, similarity } from "../shared/normalize";
import type { SearchResults } from "../shared/search";
import { type Filters, parseQuery } from "../shared/search-query";
import { type Hit, type Kind, queryIndex } from "./search-index";

/** What the search may show this user: their music folders and the ids they liked. */
export interface SearchContext {
  folders: string[] | null;
  liked: Set<string>;
}

const CANDIDATES = 200;

const field = (data: Record<string, unknown>, key: string) => normalize(String(data[key] ?? ""));
const has = (value: string, wanted: string) => value.includes(normalize(wanted));

/** Whether an item passes the operators; fields an item kind doesn't have (an artist's year) don't filter it. */
function passes(kind: Kind, id: string, data: Record<string, unknown>, filters: Filters, context: SearchContext): boolean {
  const { artist, album, genre, year, format, liked, unplayed } = filters;
  if (liked && !context.liked.has(id)) return false;
  if (unplayed && Number(data.playCount ?? 0) > 0) return false;
  if (artist && !has(field(data, kind === "artist" ? "name" : "artist"), artist)) return false;
  if (kind === "artist") return !(album || genre || year || format);
  if (format && kind !== "song") return false;
  if (album && !has(field(data, kind === "album" ? "name" : "album"), album)) return false;
  if (genre) {
    const genres = [data.genre, ...((data.genres as { name?: string }[] | undefined) ?? []).map((item) => item.name)];
    if (!genres.some((name) => name && has(normalize(String(name)), genre))) return false;
  }
  if (year && !(Number(data.year) >= year[0] && Number(data.year) <= year[1])) return false;
  if (format && String(data.suffix ?? "").toLowerCase() !== format) return false;
  return true;
}

/** Every item of a kind, most played first, parsed lazily so a filter that matches early stops the read early. */
function* scan(db: Database, server: string, kind: Kind, folders: string[] | null): Generator<Hit> {
  const rows = db
    .query<{ id: string; folder: string; data: string; plays: number }, [string, Kind]>(
      "select id, folder, data, plays from idx_items where server = ? and kind = ? order by plays desc",
    )
    .iterate(server, kind);
  for (const row of rows)
    if (!folders || folders.includes(row.folder))
      yield { kind, id: row.id, tier: 2, score: -Math.log1p(row.plays), data: JSON.parse(row.data) };
}

/**
 * One ranked group per kind. Order: an "artist - title" match, then exact, prefix, words and typo matches; inside a
 * tier your likes and plays win. Likes are this user's, so `starred` is replaced with theirs.
 */
export function search(db: Database, server: string, raw: string, context: SearchContext, limit = 8): SearchResults {
  const query = parseQuery(raw);
  const empty: SearchResults = { top: null, songs: [], albums: [], artists: [], chips: query.chips };
  const filtered = Object.keys(query.filters).length > 0;
  if (query.lyricsOnly || (!query.text && !filtered)) return empty;

  const rank = (kind: Kind): Hit[] => {
    const hits: Hit[] = [];
    const seen = new Set<string>();
    const take = (hit: Hit) => {
      if (seen.has(hit.id) || !passes(kind, hit.id, hit.data, query.filters, context)) return;
      seen.add(hit.id);
      hits.push({ ...hit, score: hit.score - (context.liked.has(hit.id) ? 0.5 : 0) });
    };
    if (kind === "song")
      for (const pair of query.pairs)
        for (const hit of queryIndex(db, server, pair.title, "song", CANDIDATES, context.folders))
          if (hit.tier <= 2 && similarity(pair.artist, String(hit.data.artist ?? "")) >= 0.6) take({ ...hit, tier: -1 });
    if (query.text) for (const hit of queryIndex(db, server, query.text, kind, CANDIDATES, context.folders)) take(hit);
    // Filters only ("genre:metal year:1990..1999"): most played first, stop once the group is full.
    else for (const hit of scan(db, server, kind, context.folders)) if (hits.length < limit) take(hit);
    return hits.sort((a, b) => a.tier - b.tier || a.score - b.score).slice(0, limit);
  };

  const groups = { artist: rank("artist"), album: rank("album"), song: rank("song") };
  const item = (hit: Hit) => {
    const { starred: _theirs, ...data } = hit.data;
    return context.liked.has(hit.id) ? { ...data, starred: true } : data;
  };
  // The top result: the best tier; on a tie, an artist over an album over a song (names are what people type).
  const order: Kind[] = ["artist", "album", "song"];
  const best = order
    .flatMap((kind) => (groups[kind][0] ? [groups[kind][0]] : []))
    .sort((a, b) => a.tier - b.tier || (a.tier <= 0 ? order.indexOf(a.kind) - order.indexOf(b.kind) : a.score - b.score))[0];
  return {
    top: best && query.text ? { kind: best.kind, item: item(best) } : null,
    songs: groups.song.map(item),
    albums: groups.album.map(item),
    artists: groups.artist.map(item),
    chips: query.chips,
  };
}
