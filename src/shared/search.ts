/** The server's search index for one Navidrome, as `/api/index` reports it. */
export interface IndexStatus {
  songs: number;
  albums: number;
  artists: number;
  /** When the last full pass finished (ms), null before the first. */
  lastSync: number | null;
  building: boolean;
}
