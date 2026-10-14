/** The server's search index for one Navidrome, as `/api/index` reports it. */
export interface IndexStatus {
  songs: number;
  albums: number;
  artists: number;
  /** When the last full pass finished (ms), null before the first. */
  lastSync: number | null;
  building: boolean;
}

/** A song found by its lyrics: the matching line, one line either side, and where to start playing. */
export interface LyricsHit {
  song: Record<string, unknown>;
  line: number;
  /** Where the line starts (ms) when the lyrics are synced; null for plain lyrics. */
  start: number | null;
  before: string;
  text: string;
  after: string;
  /** [start, end) character ranges of `text` that matched. */
  highlights: [number, number][];
}

export interface LyricsSearch {
  hits: LyricsHit[];
  /** Songs whose lyrics were looked up so far, out of the whole library. */
  checked: number;
  total: number;
}
