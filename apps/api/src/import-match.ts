import type { Database } from "bun:sqlite";
import type { Candidate, ImportMatch } from "@lodesong/shared/import-match";
import { REVIEW_FROM } from "@lodesong/shared/import-match";
import { normalize, similarity } from "@lodesong/shared/normalize";
import type { ImportTrack } from "@lodesong/shared/spotify-import";
import { queryIndex } from "./search-index";

// Candidates come from the search index, so a match only ever offers songs this user may see.

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function durationScore(wantedMs: number | undefined, seconds: number | undefined): number {
  if (!wantedMs || !seconds) return 0.05;
  const gap = Math.abs(wantedMs / 1000 - seconds);
  return gap <= 3 ? 0.1 : gap <= 8 ? 0 : -0.15;
}

export function confidence(track: ImportTrack, song: Record<string, unknown>): number {
  const isrcs = [song.isrc, ...(Array.isArray(song.isrc) ? song.isrc : [])].flat().map((value) => String(value ?? "").toUpperCase());
  if (track.isrc && isrcs.includes(track.isrc.toUpperCase())) return 1;
  const title =
    normalize(track.title) === normalize(String(song.title ?? "")) ? 1 : similarity(track.title, String(song.title ?? "")) * 0.9;
  const artist = Math.max(
    similarity(track.artist, String(song.artist ?? "")),
    normalize(String(song.artist ?? "")).includes(normalize(track.artist)) ? 1 : 0,
  );
  return clamp(title * 0.55 + artist * 0.35 + durationScore(track.durationMs, Number(song.duration) || undefined));
}

const candidate = (song: Record<string, unknown>, score: number): Candidate => ({
  id: String(song.id),
  title: String(song.title ?? ""),
  artist: String(song.artist ?? ""),
  ...(song.album ? { album: String(song.album) } : {}),
  ...(song.coverArt ? { coverArt: String(song.coverArt) } : {}),
  ...(Number(song.duration) > 0 ? { duration: Number(song.duration) } : {}),
  confidence: Math.round(score * 100) / 100,
});

export function matchTrack(db: Database, server: string, folders: string[] | null, track: ImportTrack): ImportMatch {
  const found = new Map<string, Record<string, unknown>>();
  // An ISRC is an exact key: look it up first, so the free-text searches below can't crowd the right song out.
  const isrc = track.isrc?.toUpperCase();
  if (isrc && /^[A-Z0-9]{12}$/.test(isrc))
    for (const row of db
      .query<{ id: string; folder: string; data: string }, [string, string]>(
        "select id, folder, data from idx_items where server = ? and kind = 'song' and upper(data) like ? limit 20",
      )
      .all(server, `%"${isrc}"%`))
      if (!folders || folders.includes(row.folder)) found.set(row.id, JSON.parse(row.data));
  // By title, then by "artist title" (the typo-tolerant path searches everything indexed about a song).
  for (const text of [track.title, `${track.artist} ${track.title}`])
    for (const hit of queryIndex(db, server, text, "song", 30, folders)) found.set(hit.id, hit.data);
  const scored = [...found.values()].map((song) => candidate(song, confidence(track, song))).sort((a, b) => b.confidence - a.confidence);
  const [best, ...rest] = scored;
  if (!best || best.confidence < REVIEW_FROM - 0.25) return { best: null, alternatives: [] };
  return { best: best.confidence >= REVIEW_FROM ? best : null, alternatives: (best.confidence >= REVIEW_FROM ? rest : scored).slice(0, 4) };
}
