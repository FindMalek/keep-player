import { useSyncExternalStore } from "react";
import { notify } from "./notify";
import { queries, queryClient } from "./queries";
import { api, onAccountChange } from "./subsonic";

/*
 * Likes (Subsonic stars), the ones Arpeggi and every other client see. One set of ids for songs, albums and artists,
 * read from getStarred2 and changed optimistically: a heart flips at once and flips back if the server says no.
 * Each heart subscribes to its own id, so liking one song re-renders one button, not the list.
 */

export type LikeKind = "song" | "album" | "artist";

let liked = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Pending changes, so a refresh that lands mid-request doesn't undo what you just clicked. */
const pending = new Map<string, boolean>();
let lastLoad = 0;
const REFRESH_MS = 10_000;

export async function loadLikes(): Promise<void> {
  lastLoad = Date.now();
  const starred = await queryClient.fetchQuery({ ...queries.starred(), staleTime: 0 }).catch(() => null);
  if (!starred) return;
  const next = new Set([...starred.song, ...starred.album, ...starred.artist].map((item) => item.id));
  for (const [id, value] of pending) value ? next.add(id) : next.delete(id);
  liked = next;
  emit();
}

// A like made on the phone shows up when you come back to this tab.
if (typeof window !== "undefined")
  window.addEventListener("focus", () => {
    if (Date.now() - lastLoad > REFRESH_MS) void loadLikes();
  });
onAccountChange(() => {
  liked = new Set();
  emit();
});

export function useLiked(id: string | undefined): boolean {
  return useSyncExternalStore(subscribe, () => (id ? liked.has(id) : false));
}

export function isLiked(id: string): boolean {
  return liked.has(id);
}

const PARAM: Record<LikeKind, string> = { song: "id", album: "albumId", artist: "artistId" };

/** Like or unlike; unliking offers an undo. */
export async function setLiked(kind: LikeKind, id: string, value: boolean, label: string): Promise<void> {
  if (liked.has(id) === value) return;
  const apply = (state: boolean) => {
    liked = new Set(liked);
    state ? liked.add(id) : liked.delete(id);
    emit();
  };
  apply(value);
  pending.set(id, value);
  try {
    await api(value ? "star" : "unstar", { [PARAM[kind]]: id });
    void queryClient.invalidateQueries({ queryKey: queries.starred().queryKey });
    if (!value)
      notify({
        message: `removed ${label} from your likes`,
        action: { label: "undo", onClick: () => void setLiked(kind, id, true, label) },
      });
  } catch {
    apply(!value);
    notify({ kind: "error", message: `couldn't ${value ? "like" : "unlike"} ${label}` });
  } finally {
    pending.delete(id);
  }
}

export function toggleLiked(kind: LikeKind, id: string, label: string): Promise<void> {
  return setLiked(kind, id, !liked.has(id), label);
}
