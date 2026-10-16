import { normalize, similarity } from "@keep/shared/normalize";
import { useSyncExternalStore } from "react";
import type { Song } from "./types";

/*
 * ⌘F inside a list: filters the page's track list (album, playlist, …) or, with focus in it, the queue panel, in
 * place and instantly. Client-side only; the list stays the play context, so playing a match keeps the album order.
 */

export type FilterScope = "page" | "queue";

let state: { scope: FilterScope; query: string } | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

function set(next: typeof state): void {
  state = next;
  emit();
}

/** ⌘F: open the filter of the list that has focus or is on the page; false when there is none (browser find). */
export function openListFilter(): boolean {
  const inQueue = document.activeElement?.closest("[data-filter-scope=queue]");
  const scope: FilterScope | null = inQueue ? "queue" : document.querySelector("[data-filter-scope=page]") ? "page" : null;
  if (!scope) return false;
  if (state?.scope === scope) emit();
  else set({ scope, query: "" });
  return true;
}

export function setListFilter(query: string): void {
  if (state) set({ ...state, query });
}

export function closeListFilter(scope: FilterScope): void {
  if (state?.scope === scope) set(null);
}

/** The filter text while this scope's filter is open, else null. */
export function useListFilter(scope: FilterScope): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (state?.scope === scope ? state.query : null),
  );
}

/** Every typed word starts a word of the title, artist or album, or the whole is a close spelling of them. */
export function songMatches(song: Song, query: string): boolean {
  const wanted = normalize(query);
  if (!wanted) return true;
  const fields = normalize([song.title, song.artist, song.album].filter(Boolean).join(" "));
  const words = fields.split(" ");
  if (wanted.split(" ").every((term) => words.some((word) => word.startsWith(term)))) return true;
  return wanted.length >= 4 && similarity(wanted, fields) >= 0.6;
}
