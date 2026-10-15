/** One row of a top list: a song, artist, album or genre, with counted plays (skips excluded) and minutes. */
export interface StatItem {
  id: string;
  name: string;
  plays: number;
  minutes: number;
  /** The artist, for songs and albums. */
  detail?: string;
  /** Songs only: the song as it was played, to play it again. */
  song?: { id: string } & Record<string, unknown>;
}

/** `/api/stats?from=&to=&tz=`: your listening in a range. */
export interface ListeningStats {
  from: number;
  to: number;
  minutes: number;
  /** Counted plays (not skips). */
  plays: number;
  skips: number;
  /** Different songs played. */
  songs: number;
  /** Of those, first heard in this range vs heard before it. */
  discovery: { fresh: number; familiar: number };
  /** Days in a row with a play, all time. */
  streaks: { current: number; longest: number };
  top: { songs: StatItem[]; artists: StatItem[]; albums: StatItem[]; genres: StatItem[] };
  /** Minutes by weekday (0 = Sunday) × hour, local time. */
  clock: number[][];
  /** Minutes per local day (YYYY-MM-DD) across the range. */
  days: { day: string; minutes: number }[];
}
