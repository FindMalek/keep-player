import type { Database } from "bun:sqlite";

/*
 * Songs you never want a radio to play (#55), per account, so every browser's stations skip them. The song is kept as
 * it was, so the ban list shows titles without asking Navidrome.
 */

export function createRadioTables(db: Database): void {
  db.run(`create table if not exists radio_bans (
    account text not null,
    song_id text not null,
    song text not null,
    created integer not null,
    primary key (account, song_id)
  )`);
}

export function listBans(db: Database, account: string): ({ id: string } & Record<string, unknown>)[] {
  return db
    .query<{ song: string }, [string]>("select song from radio_bans where account = ? order by created desc")
    .all(account)
    .map((row) => JSON.parse(row.song));
}

export function ban(db: Database, account: string, song: { id: string } & Record<string, unknown>, now = Date.now()): void {
  db.query("insert or replace into radio_bans (account, song_id, song, created) values (?, ?, ?, ?)").run(
    account,
    song.id,
    JSON.stringify(song),
    now,
  );
}

export function unban(db: Database, account: string, songId: string): void {
  db.query("delete from radio_bans where account = ? and song_id = ?").run(account, songId);
}
