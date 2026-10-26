import type { AlbumPref, Prefs, SongPref } from "@keep/shared/prefs";
import { useSyncExternalStore } from "react";
import { setShuffleRules } from "./queue";
import { HEADERS, onAccountChange } from "./subsonic";

// The editing side lives in prefs-edit.ts so it stays off the first screen.

let songs = new Map<string, SongPref>();
let albums = new Map<string, AlbumPref>();
let version = 0;
const listeners = new Set<() => void>();

export const songPref = (id: string): SongPref | undefined => songs.get(id);
export const albumPref = (id: string | undefined): AlbumPref | undefined => (id ? albums.get(id) : undefined);

/** Never in shuffle or radio: the song's own flag, hidden, or its album's. */
export const isSkipped = (song: { id: string; albumId?: string }): boolean => {
  const pref = songs.get(song.id);
  return Boolean(pref?.never || pref?.hidden || albumPref(song.albumId)?.never);
};

export const anyHidden = (): boolean => {
  for (const pref of songs.values()) if (pref.hidden) return true;
  return false;
};

export interface RuleMarks {
  trim: boolean;
  never: boolean;
  hidden: boolean;
}
const MARKS = new Map<string, RuleMarks>();

/** The same object for the same marks, so a memoized row doesn't re-render. */
export function ruleMarks(song: { id: string; albumId?: string }): RuleMarks | null {
  const pref = songs.get(song.id);
  const trim = pref?.trimStart != null || pref?.trimEnd != null;
  const never = Boolean(pref?.never || albumPref(song.albumId)?.never);
  const hidden = Boolean(pref?.hidden);
  if (!trim && !never && !hidden) return null;
  const key = `${+trim}${+never}${+hidden}`;
  let marks = MARKS.get(key);
  if (!marks) {
    marks = { trim, never, hidden };
    MARKS.set(key, marks);
  }
  return marks;
}

export const isHidden = (id: string): boolean => Boolean(songs.get(id)?.hidden);

export function replacePrefs(prefs: Prefs): void {
  songs = new Map(prefs.songs.map((pref) => [pref.id, pref]));
  albums = new Map(prefs.albums.map((pref) => [pref.id, pref]));
  version += 1;
  for (const listener of listeners) listener();
}

setShuffleRules({
  skip: isSkipped,
  block: (song) => (song.albumId && albums.get(song.albumId)?.keepOrder ? song.albumId : null),
});

export async function loadPrefs(): Promise<void> {
  const response = await fetch("/api/prefs", { headers: HEADERS }).catch(() => null);
  if (response?.ok) replacePrefs((await response.json()) as Prefs);
}

onAccountChange(() => replacePrefs({ songs: [], albums: [] }));

export function usePrefsVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
}

export function allPrefs(): Prefs {
  return { songs: [...songs.values()], albums: [...albums.values()] };
}
