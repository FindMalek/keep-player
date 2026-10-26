import { type Bucket, bucketOf, type Candidate, type ImportMatch } from "@keep/shared/import-match";
import type { ImportSet, ImportTrack } from "@keep/shared/spotify-import";

export interface ImportRow {
  track: ImportTrack;
  match: ImportMatch;
  /** The song this track becomes: the matcher's best, or one the user picked; null for none. */
  choice: Candidate | null;
  skipped: boolean;
}

export const trackKey = (track: ImportTrack): string => `${track.title}\u0000${track.artist}`.toLowerCase();

export function toRow(track: ImportTrack, match: ImportMatch): ImportRow {
  return { track, match, choice: match.best, skipped: false };
}

/** Matched (sure), review (likely, check it) or missing (nothing, or skipped by the user for good measure). */
export function rowBucket(row: ImportRow): Bucket {
  return row.choice ? bucketOf(row.choice.confidence) : "missing";
}

export function pick(row: ImportRow, song: Candidate): ImportRow {
  return { ...row, choice: { ...song, confidence: 1 }, skipped: false };
}

export function counts(rows: Iterable<ImportRow>): Record<Bucket, number> & { skipped: number } {
  const total = { matched: 0, review: 0, missing: 0, skipped: 0 };
  for (const row of rows) {
    if (row.skipped) total.skipped += 1;
    else total[rowBucket(row)] += 1;
  }
  return total;
}

export interface Plan {
  playlists: { name: string; songIds: string[]; wanted: number }[];
  liked: string[];
}

export function buildPlan(set: ImportSet, rows: Map<string, ImportRow>, folder: string): Plan {
  const usable = (track: ImportTrack): string | null => {
    const row = rows.get(trackKey(track));
    return row && !row.skipped && row.choice ? row.choice.id : null;
  };
  const prefix = folder.trim() ? `${folder.trim()} / ` : "";
  return {
    playlists: set.playlists.map((playlist) => ({
      name: `${prefix}${playlist.name}`,
      songIds: [...new Set(playlist.tracks.map(usable).filter((id): id is string => id !== null))],
      wanted: playlist.tracks.length,
    })),
    liked: [...new Set(set.liked.map(usable).filter((id): id is string => id !== null))],
  };
}

export function missingTracks(rows: Iterable<ImportRow>): ImportTrack[] {
  return [...rows].filter((row) => row.skipped || !row.choice).map((row) => row.track);
}
