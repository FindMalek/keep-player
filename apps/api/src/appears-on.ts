import type { Database } from "bun:sqlite";
import { folderFilter } from "./lyrics-coverage";

/*
 * "Appears on" (#49): albums by someone else with this artist on them (a feature, a compilation, a soundtrack).
 * Navidrome's getArtist lists only albums where the artist is the album artist, so this reads the index.
 */

type Item = { id: string; albumId?: string; artistId?: string; artists?: { id?: string }[]; year?: number } & Record<string, unknown>;

const features = (item: Item, artistId: string) =>
  item.artistId === artistId || (item.artists ?? []).some((artist) => artist.id === artistId);

export function appearsOn(db: Database, server: string, artistId: string, folders: string[] | null, limit = 24): Item[] {
  const filter = folderFilter(folders);
  // The id is a substring prefilter (cheap); the JSON check below is the real one.
  const songs = db
    .query<{ data: string }, string[]>(
      `select i.data from idx_items i where i.server = ? and i.kind = 'song' and i.data like ?${filter.sql}`,
    )
    .all(server, `%${artistId}%`, ...filter.params)
    .map((row) => JSON.parse(row.data) as Item)
    .filter((song) => features(song, artistId));
  const albumIds = [...new Set(songs.map((song) => song.albumId).filter((id): id is string => Boolean(id)))];
  if (!albumIds.length) return [];
  return db
    .query<{ data: string }, string[]>(
      `select data from idx_items where server = ? and kind = 'album' and id in (${albumIds.map(() => "?").join(", ")})`,
    )
    .all(server, ...albumIds)
    .map((row) => JSON.parse(row.data) as Item)
    .filter((album) => !features(album, artistId))
    .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0))
    .slice(0, limit);
}
