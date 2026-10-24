import { notify } from "./notify";
import { queries, queryClient } from "./queries";
import { api } from "./subsonic";
import type { Playlist } from "./types";

/** Lyterion's editable playlist: a song added there gets re-searched for a better copy, tags and cover included. */
export const UPGRADE_PLAYLIST = "⇪ Upgrade";

export function upgradePlaylist(playlists: Playlist[] | undefined): Playlist | undefined {
  return playlists?.find((playlist) => playlist.name === UPGRADE_PLAYLIST);
}

/** Hands songs to Lyterion to replace (album findings: every song on it). */
export async function sendToUpgrade(playlist: Playlist, items: { songId?: string; albumId?: string }[]): Promise<void> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.songId) ids.add(item.songId);
    else if (item.albumId)
      for (const song of (await queryClient.fetchQuery(queries.album(item.albumId)).catch(() => null))?.song ?? []) ids.add(song.id);
  }
  if (!ids.size) return;
  await api("updatePlaylist", { playlistId: playlist.id, songIdToAdd: [...ids] })
    .then(() => notify({ message: `${ids.size === 1 ? "1 song" : `${ids.size} songs`} sent to lyterion to fix` }))
    .catch(() => notify({ kind: "error", message: "couldn't reach navidrome, try again" }));
}
