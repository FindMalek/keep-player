import { useSyncExternalStore } from "react";
import type { Song } from "./types";

/*
 * Which playlist dialog is open (new playlist, folder), so the sidebar, the shortcut and the selection bar can ask for
 * one without carrying the dialog code: the host in app.tsx loads it when asked.
 */

export type PlaylistDialog = { kind: "new"; folder?: string; songs?: Song[] } | { kind: "folder"; path: string } | null;

let open: PlaylistDialog = null;
const listeners = new Set<() => void>();

export function openPlaylistDialog(dialog: PlaylistDialog): void {
  open = dialog;
  for (const listener of listeners) listener();
}

export function usePlaylistDialog(): PlaylistDialog {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
  );
}
