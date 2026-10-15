import type { AlbumPref, Prefs, SongPref } from "../../shared/prefs";
import { clock } from "./format";
import { notify } from "./notify";
import { currentSong, player } from "./player";
import { allPrefs, replacePrefs, songPref } from "./prefs";
import { HEADERS } from "./subsonic";
import type { Song } from "./types";
import { done } from "./undo";

/** Changing the rules (#62): menus, shortcuts and the settings list all come through here, each undoable. */

export type SongChange = {
  trimStart?: number | null;
  trimEnd?: number | null;
  never?: boolean;
  hidden?: boolean;
};

async function put(kind: "songs" | "albums", id: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`/api/prefs/${kind}/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`prefs: ${response.status}`);
  replacePrefs((await response.json()) as Prefs);
}

const summary = (song: Song) => ({
  id: song.id,
  title: song.title,
  artist: song.artist,
  album: song.album,
  albumId: song.albumId,
  artistId: song.artistId,
  coverArt: song.coverArt,
  duration: song.duration,
});

/** What the song's rules were, as a change that puts them back. */
function snapshot(id: string): Required<SongChange> {
  const pref = songPref(id);
  return { trimStart: pref?.trimStart ?? null, trimEnd: pref?.trimEnd ?? null, never: pref?.never ?? false, hidden: pref?.hidden ?? false };
}

/** Optimistic: the player and the lists see it at once; the server's answer replaces it (or the old rules come back). */
export async function changeSong(song: Song, change: SongChange, label: string): Promise<void> {
  const before = snapshot(song.id);
  const after = { ...before, ...change };
  const prefs = allPrefs();
  const rest = prefs.songs.filter((pref) => pref.id !== song.id);
  const empty = after.trimStart === null && after.trimEnd === null && !after.never && !after.hidden;
  const next: SongPref = { id: song.id, song: summary(song), ...after };
  replacePrefs({ ...prefs, songs: empty ? rest : [...rest, next] });
  try {
    await put("songs", song.id, { song: summary(song), ...change });
  } catch {
    replacePrefs(prefs);
    notify({ kind: "error", message: `couldn't save that for ${song.title}` });
    return;
  }
  done({
    label,
    undo: () => put("songs", song.id, before),
    redo: () => put("songs", song.id, change),
  });
}

export async function changeAlbum(
  album: { id: string; name: string },
  change: { keepOrder?: boolean; never?: boolean },
  label: string,
): Promise<void> {
  const prefs = allPrefs();
  const old = prefs.albums.find((pref) => pref.id === album.id);
  const before = { keepOrder: old?.keepOrder ?? false, never: old?.never ?? false };
  const after = { ...before, ...change };
  const next: AlbumPref = { id: album.id, name: album.name, ...after };
  const rest = prefs.albums.filter((pref) => pref.id !== album.id);
  replacePrefs({ ...prefs, albums: !after.keepOrder && !after.never ? rest : [...rest, next] });
  try {
    await put("albums", album.id, { name: album.name, ...change });
  } catch {
    replacePrefs(prefs);
    notify({ kind: "error", message: `couldn't save that for ${album.name}` });
    return;
  }
  done({ label, undo: () => put("albums", album.id, before), redo: () => put("albums", album.id, change) });
}

/** `⌥[` / `⌥]`: the playing song starts or ends here from now on. */
export function trimHere(edge: "start" | "end"): void {
  const song = currentSong(player.getState());
  if (!song) return;
  const at = Math.round(player.getPosition() * 10) / 10;
  const pref = songPref(song.id);
  if (edge === "start" && pref?.trimEnd && at >= pref.trimEnd - 1)
    return void notify({ kind: "error", message: "the start has to be before the end" });
  if (edge === "end" && pref?.trimStart !== null && pref?.trimStart !== undefined && at <= pref.trimStart + 1)
    return void notify({ kind: "error", message: "the end has to be after the start" });
  void changeSong(
    song,
    edge === "start" ? { trimStart: at } : { trimEnd: at },
    edge === "start" ? `${song.title} now starts at ${clock(at)}` : `${song.title} now ends at ${clock(at)}`,
  );
}

export const clearTrim = (song: Song) => changeSong(song, { trimStart: null, trimEnd: null }, `cleared the trim on ${song.title}`);
