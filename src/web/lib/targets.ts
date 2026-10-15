import { queries, queryClient } from "./queries";
import type { Album, Artist, Playlist, Song } from "./types";

/** Something the item menus and drag and drop act on: songs, or an album / artist / playlist standing for its songs. */
export type MenuTarget =
  | { kind: "songs"; songs: Song[] }
  | { kind: "album"; album: Album }
  | { kind: "artist"; artist: Pick<Artist, "id" | "name"> }
  | { kind: "playlist"; playlist: Playlist };

/** The songs a target stands for, fetched when needed (an album card only knows its id). */
export async function songsOf(target: MenuTarget): Promise<Song[]> {
  switch (target.kind) {
    case "songs":
      return target.songs;
    case "album":
      return target.album.song ?? (await queryClient.fetchQuery(queries.album(target.album.id))).song ?? [];
    case "artist": {
      const artist = await queryClient.fetchQuery(queries.artist(target.artist.id));
      const albums = await Promise.all((artist.album ?? []).map((album) => queryClient.fetchQuery(queries.album(album.id))));
      return albums.flatMap((album) => album.song ?? []);
    }
    case "playlist":
      return target.playlist.entry ?? (await queryClient.fetchQuery(queries.playlist(target.playlist.id))).entry ?? [];
  }
}

export function sourceOf(target: MenuTarget) {
  if (target.kind === "album") return { kind: "album" as const, name: target.album.name, href: `/album/${target.album.id}` };
  if (target.kind === "playlist") return { kind: "playlist" as const, name: target.playlist.name, href: `/playlist/${target.playlist.id}` };
  if (target.kind === "artist") return { kind: "artist" as const, name: target.artist.name, href: `/artist/${target.artist.id}` };
  return undefined;
}
