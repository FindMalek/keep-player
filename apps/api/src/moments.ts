import type { Database } from "bun:sqlite";
import type { Moment } from "@keep/shared/moments";

/*
 * Moments (#61): timestamps you save in a song, with a note. Subsonic's bookmarks keep one position per song, so these
 * live here, per account. The song is kept as it was played, like history, so the list shows without Navidrome.
 */

export function createMomentTables(db: Database): void {
  db.run(`create table if not exists moments (
    id integer primary key,
    account text not null,
    song_id text not null,
    song text not null,
    at real not null,
    note text not null default '',
    created integer not null
  )`);
  db.run("create index if not exists moments_by_account on moments (account, song_id)");
}

interface Row {
  id: number;
  song: string;
  at: number;
  note: string;
  created: number;
}

const toMoment = (row: Row): Moment => ({ id: row.id, song: JSON.parse(row.song), at: row.at, note: row.note, created: row.created });

/** Newest first; one song's in time order when `songId` is given. */
export function listMoments(db: Database, account: string, songId?: string): Moment[] {
  return songId
    ? db
        .query<Row, [string, string]>("select id, song, at, note, created from moments where account = ? and song_id = ? order by at")
        .all(account, songId)
        .map(toMoment)
    : db
        .query<Row, [string]>("select id, song, at, note, created from moments where account = ? order by created desc limit 1000")
        .all(account)
        .map(toMoment);
}

export function addMoment(db: Database, account: string, song: Moment["song"], at: number, note: string, now = Date.now()): Moment {
  const row = db
    .query<Row, [string, string, string, number, string, number]>(
      "insert into moments (account, song_id, song, at, note, created) values (?, ?, ?, ?, ?, ?) returning id, song, at, note, created",
    )
    .get(account, song.id, JSON.stringify(song), Math.max(0, Math.round(at * 10) / 10), note.slice(0, 200), now) as Row;
  return toMoment(row);
}

export function updateMoment(db: Database, account: string, id: number, note: string): boolean {
  return db.query("update moments set note = ? where id = ? and account = ?").run(note.slice(0, 200), id, account).changes > 0;
}

export function deleteMoment(db: Database, account: string, id: number): boolean {
  return db.query("delete from moments where id = ? and account = ?").run(id, account).changes > 0;
}

/** Song id → notes, for the search's `moment:` operator. */
export function momentNotes(db: Database, account: string): Map<string, string[]> {
  const notes = new Map<string, string[]>();
  for (const row of db
    .query<{ song_id: string; note: string }, [string]>("select song_id, note from moments where account = ?")
    .all(account))
    notes.set(row.song_id, [...(notes.get(row.song_id) ?? []), row.note]);
  return notes;
}
