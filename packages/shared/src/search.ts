import type { Chip } from "./search-query";

export interface IndexStatus {
  songs: number;
  albums: number;
  artists: number;
  /** When the last full pass finished (ms), null before the first. */
  lastSync: number | null;
  building: boolean;
}

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
  checked: number;
  total: number;
}

export interface SearchResults {
  top: { kind: "song" | "album" | "artist"; item: Record<string, unknown> } | null;
  songs: Record<string, unknown>[];
  albums: Record<string, unknown>[];
  artists: Record<string, unknown>[];
  chips: Chip[];
}
