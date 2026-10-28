import type { LyricsHit, SearchResults } from "@lodesong/shared/search";
import { player } from "./player";
import { queries, queryClient } from "./queries";
import { go } from "./router";
import type { MenuTarget } from "./targets";
import type { Album, Artist, Song } from "./types";

export type ResultKind = NonNullable<SearchResults["top"]>["kind"];

const source = (query: string) => ({ kind: "search", name: `“${query}”` });

export async function playResult(kind: ResultKind, item: Record<string, unknown>, query: string): Promise<void> {
  if (kind === "song") return player.play([item as unknown as Song], 0, { source: source(query) });
  if (kind === "album") {
    const album = await queryClient.fetchQuery(queries.album(String(item.id)));
    return player.play(album.song ?? [], 0, { album: true, source: { kind: "album", name: album.name } });
  }
  const artist = item as unknown as Artist;
  const songs = await queryClient.fetchQuery(queries.topSongs(artist.name));
  player.play(songs, 0, { source: { kind: "artist", name: artist.name } });
}

export function openResult(kind: ResultKind, item: Record<string, unknown>, query: string): void {
  if (kind === "song") void playResult(kind, item, query);
  else go(`/${kind}/${encodeURIComponent(String(item.id))}`);
}

/** A lyrics hit plays its song from the matching line (plain lyrics: from the start). */
export function playLyricsHit(hit: LyricsHit, query: string): void {
  player.play([hit.song as unknown as Song], 0, { source: source(query), startAt: hit.start === null ? 0 : hit.start / 1000 });
}

export function resultTitle(kind: ResultKind, item: Record<string, unknown>): string {
  return String(kind === "song" ? (item as unknown as Song).title : (item as unknown as Album | Artist).name);
}

export function resultSubtitle(kind: ResultKind, item: Record<string, unknown>): string {
  if (kind === "artist") return `artist · ${(item as unknown as Artist).albumCount ?? 0} albums`;
  if (kind === "album") {
    const album = item as unknown as Album;
    return ["album", album.artist, album.year].filter(Boolean).join(" · ");
  }
  const song = item as unknown as Song;
  return ["song", song.artist, song.album].filter(Boolean).join(" · ");
}

const RECENT_KEY = "keep-player:recent-searches";

export function recentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function rememberSearch(query: string): void {
  const text = query.trim();
  if (!text) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([text, ...recentSearches().filter((item) => item !== text)].slice(0, 8)));
  } catch {
    // Without storage there's just no history.
  }
}

export function resultTarget(kind: ResultKind, item: Record<string, unknown>): MenuTarget {
  if (kind === "song") return { kind: "songs", songs: [item as unknown as Song] };
  if (kind === "album") return { kind: "album", album: item as unknown as Album };
  return { kind: "artist", artist: item as unknown as Artist };
}
