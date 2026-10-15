/** Lyrics as the app uses them, whatever the source (Navidrome, LRCLIB, an .lrc file). Times in milliseconds. */
export interface Lyrics {
  status: "synced" | "plain" | "instrumental" | "missing";
  lines: LyricLine[];
  /** From the file's `[offset:]` tag; added to every time already. */
  offset: number;
  source: "navidrome" | "lrclib" | null;
  /** LRCLIB's record, for "report off-sync" (lrclib.net/tracks/:id). */
  lrclibId?: number;
  /** Other languages Navidrome has for the same song (translation / romanization), one text per line. */
  translations?: { lang: string; lines: string[] }[];
}

export interface LyricLine {
  start: number;
  /** When the next line starts (or start + 5 s for the last). */
  end: number;
  text: string;
  /** Enhanced LRC word timings, when the file has them. */
  words?: { start: number; text: string }[];
}

export const MISSING: Lyrics = { status: "missing", lines: [], offset: 0, source: null };

/** `/api/lyrics/coverage`: how many songs have which kind of lyrics, and the albums missing the most. */
export interface LyricsCoverage {
  total: number;
  synced: number;
  plain: number;
  instrumental: number;
  missing: number;
  /** Not looked up yet (the backfill reaches them over time). */
  unchecked: number;
  albums: { id: string; name: string; artist: string; total: number; synced: number; plain: number; missing: number }[];
  /** Set for admins when `LYRICS_WRITE_LRC=on`: how many .lrc files keep music wrote. */
  written?: number;
}
