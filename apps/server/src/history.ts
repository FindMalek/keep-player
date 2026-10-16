import type { Database } from "bun:sqlite";
import type { Play } from "@keep/shared/history";

/*
 * Every listen in this app, per user: what played, when, how long you actually listened and whether it was a skip
 * (under 30 s and not finished). Navidrome only counts plays; skips are the better signal for radio and smart
 * shuffle (#55, #56). The song is kept as it was, so history survives a re-tag or a deleted file.
 */

const SKIP_SECONDS = 30;

export function createHistoryTables(db: Database): void {
  db.run(`create table if not exists plays (
    id integer primary key,
    account text not null,
    song_id text not null,
    song text not null,
    started integer not null,
    listened integer not null,
    skipped integer not null,
    client text not null
  )`);
  db.run("create index if not exists plays_by_time on plays (account, started desc)");
}

export interface NewPlay {
  song: { id: string } & Record<string, unknown>;
  started: number;
  /** Seconds actually listened (seeking ahead doesn't count). */
  listened: number;
  /** Whether it played to its end. */
  finished: boolean;
}

export function recordPlay(db: Database, account: string, client: string, play: NewPlay): void {
  const skipped = !play.finished && play.listened < SKIP_SECONDS;
  db.query("insert into plays (account, song_id, song, started, listened, skipped, client) values (?, ?, ?, ?, ?, ?, ?)").run(
    account,
    play.song.id,
    JSON.stringify(play.song),
    Math.round(play.started),
    Math.round(play.listened),
    skipped ? 1 : 0,
    client.slice(0, 64),
  );
}

/** Newest first, `limit` plays older than `before` (ms). */
export function readPlays(db: Database, account: string, before: number, limit: number): Play[] {
  return db
    .query<{ song: string; started: number; listened: number; skipped: number; client: string }, [string, number, number]>(
      "select song, started, listened, skipped, client from plays where account = ? and started < ? order by started desc limit ?",
    )
    .all(account, before, limit)
    .map((row) => ({
      song: JSON.parse(row.song),
      started: row.started,
      listened: row.listened,
      skipped: row.skipped === 1,
      client: row.client,
    }));
}
