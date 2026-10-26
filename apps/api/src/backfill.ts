import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import type { Upstream } from "./config";
import type { LyricsService } from "./lyrics";
import type { SessionStore } from "./sessions";
import { type Credentials, subsonic } from "./subsonic";

const PAGE = 200;
/** One song at a time, about two requests a second at most: LRCLIB is free and asks clients to be gentle. */
const STEP_MS = 600;
const MAX_BACKOFF_MS = 10 * 60_000;
const REST_MS = 24 * 3_600_000;

export function serviceAccount(
  sessions: SessionStore,
  upstream: Upstream,
  configured: { user?: string; password?: string },
): () => Credentials | null {
  const fixed =
    configured.user && configured.password
      ? (() => {
          const salt = randomBytes(8).toString("hex");
          return {
            user: configured.user,
            salt,
            token: createHash("md5")
              .update(configured.password + salt)
              .digest("hex"),
          };
        })()
      : null;
  return () => fixed ?? sessions.adminCredentials(upstream.id);
}

export class LyricsBackfill {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private backoff = STEP_MS;
  private queue: string[] = [];

  constructor(
    private readonly db: Database,
    private readonly lyrics: LyricsService,
    private readonly upstream: Upstream,
    private readonly account: () => Credentials | null,
  ) {
    db.run("create table if not exists meta (key text primary key, value text not null)");
  }

  private get offset(): number {
    return Number(
      this.db.query<{ value: string }, [string]>("select value from meta where key = ?").get(`lyrics-backfill-offset:${this.upstream.id}`)
        ?.value ?? 0,
    );
  }

  private set offset(value: number) {
    this.db
      .query("insert or replace into meta (key, value) values (?, ?)")
      .run(`lyrics-backfill-offset:${this.upstream.id}`, String(value));
  }

  start(): void {
    this.schedule(5000);
  }

  restart(): void {
    this.offset = 0;
    this.queue = [];
    this.backoff = STEP_MS;
    this.schedule(0);
  }

  stop(): void {
    clearTimeout(this.timer);
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.step().then((next) => this.schedule(next)), ms);
    this.timer.unref?.();
  }

  async step(): Promise<number> {
    const credentials = this.account();
    // Nobody to run as yet (no admin has signed in): check again later.
    if (!credentials) return 60_000;
    if (!this.queue.length) {
      const page = await subsonic<{ searchResult3: { song?: { id: string }[] } }>(this.upstream, credentials, "search3", {
        query: "",
        songCount: PAGE,
        songOffset: this.offset,
        artistCount: 0,
        albumCount: 0,
      });
      if (!page) return this.failed();
      const ids = (page.searchResult3.song ?? []).map((song) => song.id);
      if (!ids.length) {
        this.offset = 0;
        return REST_MS;
      }
      this.offset = this.offset + ids.length;
      this.queue = ids.filter((id) => !this.lyrics.cached(this.upstream.id, id));
      if (!this.queue.length) return 0;
    }
    const id = this.queue.shift() as string;
    const before = this.lyrics.cached(this.upstream.id, id);
    await this.lyrics.get(this.upstream, credentials, id);
    // Still not cached means LRCLIB or Navidrome didn't answer: slow down.
    if (!before && !this.lyrics.cached(this.upstream.id, id)) {
      this.queue.unshift(id);
      return this.failed();
    }
    this.backoff = STEP_MS;
    return STEP_MS;
  }

  private failed(): number {
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    return this.backoff;
  }
}
