export interface Lyrics {
  status: "synced" | "plain" | "instrumental" | "missing";
  lines: LyricLine[];
  /** From the file's `[offset:]` tag; added to every time already. */
  offset: number;
  source: "navidrome" | "lrclib" | null;
  /** LRCLIB's record, for "report off-sync" (lrclib.net/tracks/:id). */
  lrclibId?: number;
  translations?: { lang: string; lines: string[] }[];
}

export interface LyricLine {
  start: number;
  /** When the next line starts (or start + 5 s for the last). */
  end: number;
  text: string;
  words?: { start: number; text: string }[];
}

export const MISSING: Lyrics = { status: "missing", lines: [], offset: 0, source: null };

export interface LyricsCoverage {
  total: number;
  synced: number;
  plain: number;
  instrumental: number;
  missing: number;
  unchecked: number;
  albums: { id: string; name: string; artist: string; total: number; synced: number; plain: number; missing: number }[];
  written?: number;
}
