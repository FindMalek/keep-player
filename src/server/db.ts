import { Database } from "bun:sqlite";
import { createHistoryTables } from "./history";
import { createRadioTables } from "./radio";

/**
 * The server's library database (`$DATA_DIR/library.db`): the lyrics cache and per-user lyric offsets now, the search
 * index next (#31). Separate from sessions.db so it can be deleted and rebuilt without signing anyone out.
 */
export function openLibraryDb(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  db.run("pragma journal_mode = wal");
  db.run(`create table if not exists lyrics (
    song_id text primary key,
    status text not null,
    source text,
    lrclib_id integer,
    body text not null,
    fetched integer not null
  )`);
  db.run(`create table if not exists lyric_offsets (
    user text not null,
    song_id text not null,
    offset_ms integer not null,
    primary key (user, song_id)
  )`);
  createHistoryTables(db);
  createRadioTables(db);
  // Songs you keep in a playlist but don't want to hear from it (#46): per user, the playlist itself is untouched.
  db.run(`create table if not exists playlist_hidden (
    account text not null,
    playlist_id text not null,
    song_id text not null,
    primary key (account, playlist_id, song_id)
  )`);
  return db;
}
