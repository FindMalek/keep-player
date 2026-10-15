import { notify } from "./notify";
import { queries, queryClient } from "./queries";
import { go } from "./router";
import { api, getUser, HEADERS } from "./subsonic";
import type { Playlist, Song } from "./types";

/*
 * Playlist edits (#46), all through Subsonic so Arpeggi and every other client see them. Optimistic: the cache
 * changes at once and is corrected from the server after. Subsonic has no "move", so a reorder rewrites the songs
 * with createPlaylist(playlistId, songId[]), debounced. Folders are the "Folder / Name" naming convention.
 */

type Full = Playlist & { entry?: Song[] };

const DELETE_GRACE_MS = 10_000;
const REORDER_DEBOUNCE_MS = 800;

const refresh = (id?: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queries.playlists().queryKey }),
    id ? queryClient.invalidateQueries({ queryKey: queries.playlist(id).queryKey }) : null,
  ]);

/** Yours and not a smart playlist: what can be edited. */
export function canEdit(playlist: Playlist): boolean {
  return !playlist.readonly && (!playlist.owner || playlist.owner === getUser());
}

export function folderOf(name: string): string {
  return name.split(" / ").slice(0, -1).join(" / ");
}

export function leafOf(name: string): string {
  return name.split(" / ").at(-1) ?? name;
}

export async function createPlaylist(
  name: string,
  options: { comment?: string; isPublic?: boolean; songs?: Song[] } = {},
): Promise<string | null> {
  const created = await api<{ playlist?: Playlist }>("createPlaylist", {
    name,
    songId: (options.songs ?? []).map((song) => song.id),
  }).catch(() => null);
  const id = created?.playlist?.id;
  if (!id) {
    notify({ kind: "error", message: `couldn't create ${name}` });
    return null;
  }
  if (options.comment || options.isPublic)
    await api("updatePlaylist", { playlistId: id, comment: options.comment ?? "", public: String(Boolean(options.isPublic)) });
  await refresh(id);
  return id;
}

function patch(id: string, change: Partial<Full>): void {
  queryClient.setQueryData(queries.playlist(id).queryKey, (current?: Full) => (current ? { ...current, ...change } : current));
  queryClient.setQueryData(queries.playlists().queryKey, (current?: Playlist[]) =>
    current?.map((playlist) => (playlist.id === id ? { ...playlist, ...change } : playlist)),
  );
}

/** Name, description or visibility. */
export async function updatePlaylist(id: string, change: { name?: string; comment?: string; public?: boolean }): Promise<void> {
  patch(id, change);
  const params: Record<string, string> = { playlistId: id };
  if (change.name !== undefined) params.name = change.name;
  if (change.comment !== undefined) params.comment = change.comment;
  if (change.public !== undefined) params.public = String(change.public);
  await api("updatePlaylist", params).catch(() => notify({ kind: "error", message: "couldn't save the playlist" }));
  await refresh(id);
}

/** Renaming a folder renames every playlist in it (and in its subfolders). */
export async function renameFolder(from: string, to: string): Promise<void> {
  const playlists = queryClient.getQueryData<Playlist[]>(queries.playlists().queryKey) ?? [];
  const inside = playlists.filter((playlist) => playlist.name.startsWith(`${from} / `) && canEdit(playlist));
  await Promise.all(inside.map((playlist) => updatePlaylist(playlist.id, { name: `${to}${playlist.name.slice(from.length)}` })));
}

/** Gone from the lists at once; actually deleted after 10 s unless undone. */
export function deletePlaylist(playlist: Playlist, path: string): void {
  const before = queryClient.getQueryData<Playlist[]>(queries.playlists().queryKey);
  queryClient.setQueryData(queries.playlists().queryKey, (current?: Playlist[]) => current?.filter((item) => item.id !== playlist.id));
  if (path === `/playlist/${playlist.id}`) go("/");
  const timer = setTimeout(() => {
    void api("deletePlaylist", { id: playlist.id }).finally(() => refresh());
  }, DELETE_GRACE_MS);
  notify({
    message: `deleted ${leafOf(playlist.name)}`,
    duration: DELETE_GRACE_MS,
    action: {
      label: "undo",
      onClick: () => {
        clearTimeout(timer);
        if (before) queryClient.setQueryData(queries.playlists().queryKey, before);
      },
    },
  });
}

async function full(id: string): Promise<Full> {
  return (await queryClient.fetchQuery({ ...queries.playlist(id), staleTime: 0 })) as Full;
}

async function append(playlist: Playlist, songs: Song[]): Promise<void> {
  if (!songs.length) return;
  await api("updatePlaylist", { playlistId: playlist.id, songIdToAdd: songs.map((song) => song.id) });
  await refresh(playlist.id);
  notify({ message: `added ${songs.length === 1 ? (songs[0] as Song).title : `${songs.length} songs`} to ${leafOf(playlist.name)}` });
}

/** Add songs; any already in the playlist get asked about first ("add anyway" or "skip" them). */
export async function addToPlaylist(playlist: Playlist, songs: Song[]): Promise<void> {
  const present = new Set(((await full(playlist.id).catch(() => null))?.entry ?? []).map((song) => song.id));
  const duplicates = songs.filter((song) => present.has(song.id));
  if (!duplicates.length) return append(playlist, songs);
  const fresh = songs.filter((song) => !present.has(song.id));
  notify({
    message:
      duplicates.length === 1 && songs.length === 1
        ? `${(duplicates[0] as Song).title} is already in ${leafOf(playlist.name)}`
        : `${duplicates.length} of ${songs.length} already in ${leafOf(playlist.name)}`,
    duration: 15_000,
    id: "playlist-duplicates",
    action: { label: "add anyway", onClick: () => void append(playlist, songs) },
    cancel: { label: fresh.length ? "skip those" : "skip", onClick: () => void append(playlist, fresh) },
  });
}

/** Rewrite a playlist's songs in this order (Subsonic's only way to reorder). */
async function rewrite(id: string, songs: Song[]): Promise<void> {
  await api("createPlaylist", { playlistId: id, songId: songs.map((song) => song.id) });
  await refresh(id);
}

/** Remove the songs at these positions, with undo. */
export async function removeFromPlaylist(playlist: Full, indexes: number[]): Promise<void> {
  const before = playlist.entry ?? [];
  const removing = new Set(indexes);
  const after = before.filter((_, index) => !removing.has(index));
  patch(playlist.id, { entry: after, songCount: after.length });
  await api("updatePlaylist", { playlistId: playlist.id, songIndexToRemove: indexes });
  await refresh(playlist.id);
  notify({
    message: `removed ${indexes.length === 1 ? (before[indexes[0] as number]?.title ?? "a song") : `${indexes.length} songs`} from ${leafOf(playlist.name)}`,
    action: { label: "undo", onClick: () => void rewrite(playlist.id, before) },
  });
}

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; songs: Song[] }>();

/** Show the new order at once, save it once the moving stops. */
export function reorderPlaylist(id: string, songs: Song[]): void {
  patch(id, { entry: songs });
  clearTimeout(pending.get(id)?.timer);
  pending.set(id, {
    songs,
    timer: setTimeout(() => {
      pending.delete(id);
      void rewrite(id, songs).catch(() => notify({ kind: "error", message: "couldn't save the new order" }));
    }, REORDER_DEBOUNCE_MS),
  });
}

/*
 * Leaving (or reloading) before the debounce ends still saves the order: sent with keepalive, and kept in
 * sessionStorage so the next page load sends it again first (its own read could beat the keepalive write).
 */
const UNSAVED_KEY = "keep-player:unsaved-orders";
if (typeof window !== "undefined") {
  try {
    const unsaved = JSON.parse(sessionStorage.getItem(UNSAVED_KEY) ?? "[]") as [string, Song[]][];
    sessionStorage.removeItem(UNSAVED_KEY);
    for (const [id, songs] of unsaved) {
      patch(id, { entry: songs });
      void rewrite(id, songs).catch(() => undefined);
    }
  } catch {
    // Nothing kept.
  }
  window.addEventListener("pagehide", () => {
    try {
      if (pending.size) sessionStorage.setItem(UNSAVED_KEY, JSON.stringify([...pending].map(([id, { songs }]) => [id, songs])));
    } catch {
      // The keepalive request below still goes.
    }
    for (const [id, { timer, songs }] of pending) {
      clearTimeout(timer);
      void fetch("/rest/createPlaylist", {
        method: "POST",
        keepalive: true,
        headers: { ...HEADERS, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams([["playlistId", id], ...songs.map((song) => ["songId", song.id])]),
      });
    }
    pending.clear();
  });
}

export function moveInPlaylist(playlist: Full, index: number, delta: -1 | 1): number {
  const songs = [...(playlist.entry ?? [])];
  const target = index + delta;
  if (target < 0 || target >= songs.length) return index;
  const [song] = songs.splice(index, 1);
  if (song) songs.splice(target, 0, song);
  reorderPlaylist(playlist.id, songs);
  return target;
}

/** Songs you hid in a playlist (kept in it, skipped when it plays). */
export const hiddenQuery = (id: string) => ({
  queryKey: ["playlistHidden", id],
  queryFn: async (): Promise<string[]> => {
    const response = await fetch(`/api/playlists/${encodeURIComponent(id)}/hidden`, { headers: HEADERS });
    return response.ok ? ((await response.json()) as { songs: string[] }).songs : [];
  },
  staleTime: 60_000,
});

export async function setHidden(playlistId: string, songId: string, hidden: boolean): Promise<void> {
  const key = hiddenQuery(playlistId).queryKey;
  queryClient.setQueryData(key, (current: string[] = []) =>
    hidden ? [...new Set([...current, songId])] : current.filter((id) => id !== songId),
  );
  await fetch(`/api/playlists/${encodeURIComponent(playlistId)}/hidden`, {
    method: "PUT",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ songId, hidden }),
  }).catch(() => undefined);
}

// Edits made on the phone show up when you come back to the tab.
if (typeof window !== "undefined")
  window.addEventListener("focus", () => void queryClient.invalidateQueries({ queryKey: queries.playlists().queryKey }));
