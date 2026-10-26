import type { Song } from "./types";

export interface Station {
  name: string;
  anchors: Song[];
  liked: Set<string>;
  disliked: Set<string>;
  /** Artist → how many of their songs were 👎 or skipped; two and they're out. */
  artistStrikes: Map<string, number>;
  played: Set<string>;
  /** 0: songs you play a lot · 1: songs you've never played. */
  variety: number;
  eraLock: [number, number] | null;
  artistLock: { id: string; name: string } | null;
}

export const artistOf = (song: Song) => song.artistId ?? song.artist ?? "";

export function pick(
  current: Station,
  found: { song: Song; weight: number }[],
  count: number,
  banned: Set<string>,
  random: () => number = Math.random,
): Song[] {
  const scored = new Map<string, { song: Song; score: number }>();
  for (const { song, weight } of found) {
    if (banned.has(song.id) || current.disliked.has(song.id) || current.played.has(song.id)) continue;
    if ((current.artistStrikes.get(artistOf(song)) ?? 0) >= 2) continue;
    if (current.artistLock && song.artistId !== current.artistLock.id && song.artist !== current.artistLock.name) continue;
    if (current.eraLock && song.year && (song.year < current.eraLock[0] || song.year > current.eraLock[1])) continue;
    const plays = Number(song.playCount ?? 0);
    const familiarity = Math.min(1, Math.log1p(plays) / Math.log1p(50));
    const taste = (1 - current.variety) * familiarity + current.variety * (plays === 0 ? 1 : 0);
    const score = weight + 2 * taste + random();
    const seen = scored.get(song.id);
    scored.set(song.id, { song, score: (seen?.score ?? 0) + score });
  }
  // At most two songs per artist in a batch (unless the station is locked to one).
  const perArtist = new Map<string, number>();
  const picked: Song[] = [];
  for (const { song } of [...scored.values()].sort((a, b) => b.score - a.score)) {
    const artist = artistOf(song);
    if (!current.artistLock && (perArtist.get(artist) ?? 0) >= 2) continue;
    perArtist.set(artist, (perArtist.get(artist) ?? 0) + 1);
    picked.push(song);
    if (picked.length >= count) break;
  }
  return picked;
}
