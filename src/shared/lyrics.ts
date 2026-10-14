/** Lyrics as the app uses them, whatever the source (Navidrome, LRCLIB, an .lrc file). Times in milliseconds. */
export interface Lyrics {
  status: "synced" | "plain" | "instrumental" | "missing";
  lines: LyricLine[];
  /** From the file's `[offset:]` tag; added to every time already. */
  offset: number;
  source: "navidrome" | "lrclib" | null;
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
