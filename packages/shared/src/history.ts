export interface Play {
  song: { id: string } & Record<string, unknown>;
  /** When it started (ms epoch). */
  started: number;
  /** Seconds actually listened. */
  listened: number;
  /** Left within 30 s without finishing. */
  skipped: boolean;
  client: string;
}
