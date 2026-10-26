import { useSyncExternalStore } from "react";
import { notify } from "./notify";
import { stillPlaying } from "./now-playing";
import { player } from "./player";
import { sessionState } from "./session-state";
import { getSetting } from "./settings";
import { api, CLIENT_NAME, getUser } from "./subsonic";
import type { Song } from "./types";

// Subsonic can't pause another device, so this stays informational.

export interface Elsewhere {
  song: Song;
  device: string;
}

const POLL_MS = 30_000;

let playing: Elsewhere[] = [];
const listeners = new Set<() => void>();

function set(next: Elsewhere[]): void {
  if (next.length === playing.length && next.every((item, index) => item.song.id === playing[index]?.song.id)) return;
  playing = next;
  for (const listener of listeners) listener();
  courtesy();
}

let hinted = false;
function courtesy(): void {
  // A remote's "playing" is the other device's, and that one is in the same session, not competing.
  const here = player.getState().playing && !player.isRemote();
  if (!here) hinted = false;
  else if (playing[0] && !hinted) {
    hinted = true;
    notify({ message: `${playing[0].device} is also playing · it can't be paused from here`, id: "also-playing" });
  }
}

export function deviceName(client: string): string {
  return client.startsWith("keep-player@") ? "another browser" : client || "another device";
}

type Entry = Song & { username?: string; playerName?: string; minutesAgo?: number };

let entries: Entry[] = [];

function refresh(): void {
  const me = getUser();
  set(
    entries
      .filter((entry) => entry.username === me && entry.playerName !== CLIENT_NAME && stillPlaying(entry))
      .filter((entry) => !(sessionState.get().connected && entry.playerName?.startsWith("keep-player@")))
      // Another app (your phone) before another browser of ours: the more useful one to show.
      .sort((a, b) => Number(a.playerName?.startsWith("keep-player@")) - Number(b.playerName?.startsWith("keep-player@")))
      .map((entry) => ({ song: entry, device: deviceName(entry.playerName ?? "") })),
  );
}

async function poll(): Promise<void> {
  if (!getSetting("queueSync") || document.hidden) return;
  const response = await api<{ nowPlaying?: { entry?: Entry[] } }>("getNowPlaying").catch(() => null);
  if (!response) return;
  entries = response.nowPlaying?.entry ?? [];
  refresh();
}

let started = false;

export function startElsewhere(): void {
  if (started) return;
  started = true;
  void poll();
  setInterval(() => void poll(), POLL_MS);
  window.addEventListener("focus", () => void poll());
  player.subscribe(courtesy);
  sessionState.subscribe(refresh);
}

export function useElsewhere(): Elsewhere[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => playing,
  );
}
