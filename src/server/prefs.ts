import type { Database } from "bun:sqlite";
import type { AlbumPref, Prefs, SongPref } from "../shared/prefs";

/*
 * Per-song and per-album playback rules (#62): trims, never in shuffle or radio, keep an album in order, hide a song.
 * Per account, so a trim made on the phone applies at the desk. A row with nothing set is deleted.
 */

export function createPrefTables(db: Database): void {
  db.run(`create table if not exists song_prefs (
    account text not null,
    song_id text not null,
    song text,
    trim_start real,
    trim_end real,
    never integer not null default 0,
    hidden integer not null default 0,
    primary key (account, song_id)
  )`);
  db.run(`create table if not exists album_prefs (
    account text not null,
    album_id text not null,
    name text not null default '',
    keep_order integer not null default 0,
    never integer not null default 0,
    primary key (account, album_id)
  )`);
}

export function readPrefs(db: Database, account: string): Prefs {
  const songs = db
    .query<
      { song_id: string; song: string | null; trim_start: number | null; trim_end: number | null; never: number; hidden: number },
      [string]
    >("select song_id, song, trim_start, trim_end, never, hidden from song_prefs where account = ?")
    .all(account)
    .map(
      (row): SongPref => ({
        id: row.song_id,
        song: row.song ? JSON.parse(row.song) : null,
        trimStart: row.trim_start,
        trimEnd: row.trim_end,
        never: row.never === 1,
        hidden: row.hidden === 1,
      }),
    );
  const albums = db
    .query<{ album_id: string; name: string; keep_order: number; never: number }, [string]>(
      "select album_id, name, keep_order, never from album_prefs where account = ?",
    )
    .all(account)
    .map((row): AlbumPref => ({ id: row.album_id, name: row.name, keepOrder: row.keep_order === 1, never: row.never === 1 }));
  return { songs, albums };
}

export interface SongChange {
  song?: ({ id: string } & Record<string, unknown>) | null;
  trimStart?: number | null;
  trimEnd?: number | null;
  never?: boolean;
  hidden?: boolean;
}

const seconds = (value: unknown): number | null | undefined =>
  value === null
    ? null
    : typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 86_400
      ? Math.round(value * 10) / 10
      : undefined;

/** Applies the fields that were sent; false when a value was invalid or the trim is empty (end before start). */
export function changeSong(db: Database, account: string, id: string, change: SongChange): boolean {
  const current = readPrefs(db, account).songs.find((pref) => pref.id === id);
  const next = {
    song: change.song === undefined ? (current?.song ?? null) : change.song,
    trimStart: current?.trimStart ?? null,
    trimEnd: current?.trimEnd ?? null,
    never: change.never ?? current?.never ?? false,
    hidden: change.hidden ?? current?.hidden ?? false,
  };
  for (const key of ["trimStart", "trimEnd"] as const) {
    if (change[key] === undefined) continue;
    const value = seconds(change[key]);
    if (value === undefined) return false;
    next[key] = value;
  }
  if (next.trimStart !== null && next.trimEnd !== null && next.trimEnd <= next.trimStart + 1) return false;
  const empty = next.trimStart === null && next.trimEnd === null && !next.never && !next.hidden;
  if (empty) db.query("delete from song_prefs where account = ? and song_id = ?").run(account, id);
  else
    db.query(
      "insert or replace into song_prefs (account, song_id, song, trim_start, trim_end, never, hidden) values (?, ?, ?, ?, ?, ?, ?)",
    ).run(account, id, next.song ? JSON.stringify(next.song) : null, next.trimStart, next.trimEnd, next.never ? 1 : 0, next.hidden ? 1 : 0);
  return true;
}

export function changeAlbum(
  db: Database,
  account: string,
  id: string,
  change: { name?: string; keepOrder?: boolean; never?: boolean },
): void {
  const current = readPrefs(db, account).albums.find((pref) => pref.id === id);
  const next = {
    name: (change.name ?? current?.name ?? "").slice(0, 200),
    keepOrder: change.keepOrder ?? current?.keepOrder ?? false,
    never: change.never ?? current?.never ?? false,
  };
  if (!next.keepOrder && !next.never) db.query("delete from album_prefs where account = ? and album_id = ?").run(account, id);
  else
    db.query("insert or replace into album_prefs (account, album_id, name, keep_order, never) values (?, ?, ?, ?, ?)").run(
      account,
      id,
      next.name,
      next.keepOrder ? 1 : 0,
      next.never ? 1 : 0,
    );
}
