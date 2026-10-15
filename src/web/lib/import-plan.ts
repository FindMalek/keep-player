import { type Bucket, bucketOf, type Candidate, type ImportMatch } from "../../shared/import-match";
import type { ImportSet, ImportTrack } from "../../shared/spotify-import";

/*
 * The import's working state (#48): one row per distinct Spotify track, holding the song it will become, and the plan
 * of playlists and stars that follows from the rows the user keeps.
 */

export interface ImportRow {
  track: ImportTrack;
  /** What the matcher found. */
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

/** A song the user picked by hand is as sure as it gets. */
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

/** What to create: each playlist's songs in order (skipped and missing left out, repeats once), and the stars. */
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

/** Tracks with nothing to become (or skipped), once each, for the list of music to get. */
export function missingTracks(rows: Iterable<ImportRow>): ImportTrack[] {
  return [...rows].filter((row) => row.skipped || !row.choice).map((row) => row.track);
}
