import { deviceName } from "./elsewhere";
import { clock } from "./format";
import { notify } from "./notify";
import { player } from "./player";
import * as Q from "./queue";
import { getSetting } from "./settings";
import { api, CLIENT_NAME, HEADERS } from "./subsonic";
import type { Song } from "./types";

/*
 * The queue hand-off with Arpeggi and every other client: the Subsonic play queue. We save ours on pause, on a new
 * song, every 15 s while playing and when the tab goes away; we read the server's on load, on focus and when back
 * online, and offer it when another device saved something newer. Never yanks playback: while this tab plays it only
 * asks. Uses the OpenSubsonic index-based endpoints when the server has them (duplicate songs keep their place).
 */

const SAVE_EVERY_MS = 15_000;
const PULL_THROTTLE_MS = 30_000;
const MAX_ENTRIES = 1000;
const SAVED_KEY = "keep-player:queue-saved";
const DISMISSED_KEY = "keep-player:queue-dismissed";

interface Remote {
  songs: Song[];
  index: number;
  /** ms into the current song */
  position: number;
  changed: string;
  changedBy: string;
}

const stored = (key: string) => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};
const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Kept in memory for this session only.
  }
};

let byIndex: Promise<boolean> | null = null;
/** Whether the server has `savePlayQueueByIndex` / `getPlayQueueByIndex` (OpenSubsonic "indexBasedQueue"). */
function indexBased(): Promise<boolean> {
  byIndex ??= api<{ openSubsonicExtensions?: { name: string }[] }>("getOpenSubsonicExtensions")
    .then((response) => Boolean(response.openSubsonicExtensions?.some((extension) => extension.name === "indexBasedQueue")))
    .catch(() => false);
  return byIndex;
}

/** What's playing and everything still to come, current first. */
function snapshot(): { ids: string[]; position: number } | null {
  const { queue } = player.getState();
  if (!queue.current) return null;
  const entries = [queue.current, ...queue.upNext, ...Q.contextUpcoming(queue)].slice(0, MAX_ENTRIES);
  return { ids: entries.map((entry) => entry.song.id), position: Math.round(player.getPosition() * 1000) };
}

/** Save the queue (a form POST, so a long queue never hits a URL limit; `keepalive` survives the tab closing). */
export async function pushQueue(keepalive = false): Promise<void> {
  if (!getSetting("queueSync")) return;
  const now = snapshot();
  if (!now) return;
  const indexed = await indexBased();
  const body = new URLSearchParams(now.ids.map((id) => ["id", id]));
  if (indexed) body.set("currentIndex", "0");
  else body.set("current", now.ids[0] as string);
  body.set("position", String(now.position));
  const saved = await fetch(`/rest/${indexed ? "savePlayQueueByIndex" : "savePlayQueue"}`, {
    method: "POST",
    keepalive,
    headers: { ...HEADERS, "content-type": "application/x-www-form-urlencoded" },
    body,
  }).catch(() => null);
  if (saved?.ok) store(SAVED_KEY, String(Date.now()));
}

async function readRemote(): Promise<Remote | null> {
  type Saved = { entry?: Song[]; position?: number; changed?: string; changedBy?: string };
  if (await indexBased()) {
    const { playQueueByIndex: saved } = await api<{ playQueueByIndex?: Saved & { currentIndex?: number } }>("getPlayQueueByIndex");
    if (!saved?.entry?.length) return null;
    return {
      songs: saved.entry,
      index: saved.currentIndex ?? 0,
      position: saved.position ?? 0,
      changed: saved.changed ?? "",
      changedBy: saved.changedBy ?? "",
    };
  }
  const { playQueue: saved } = await api<{ playQueue?: Saved & { current?: string } }>("getPlayQueue");
  if (!saved?.entry?.length) return null;
  return {
    songs: saved.entry,
    index: Math.max(
      0,
      saved.entry.findIndex((song) => song.id === saved.current),
    ),
    position: saved.position ?? 0,
    changed: saved.changed ?? "",
    changedBy: saved.changedBy ?? "",
  };
}

let lastPull = 0;

/** Look at the server's queue and offer it (or take it, with "always follow" and nothing playing here). */
export async function pullQueue(force = false): Promise<void> {
  if (!getSetting("queueSync") || (!force && Date.now() - lastPull < PULL_THROTTLE_MS)) return;
  lastPull = Date.now();
  const remote = await readRemote().catch(() => null);
  if (!remote || remote.changedBy === CLIENT_NAME || remote.changed === stored(DISMISSED_KEY)) return;
  if (Date.parse(remote.changed) <= Number(stored(SAVED_KEY) || 0)) return;
  const song = remote.songs[remote.index];
  if (!song) return;
  const state = player.getState();
  // Already where the other device is: nothing to offer.
  if (state.queue.current?.song.id === song.id && Math.abs(player.getPosition() * 1000 - remote.position) < 10_000) return;
  const take = () => player.adopt(remote.songs, remote.index, remote.position / 1000);
  if (!state.playing && getSetting("followOtherDevices")) {
    take();
    return;
  }
  notify({
    message: `continue from ${deviceName(remote.changedBy)} · ${song.title} at ${clock(remote.position / 1000)}`,
    duration: 20_000,
    // Only the newest queue is worth offering.
    id: "queue-handoff",
    action: { label: "resume here", onClick: take },
    cancel: { label: "keep mine", onClick: () => store(DISMISSED_KEY, remote.changed) },
  });
}

let started = false;

/** Start saving and reading once signed in. */
export function startQueueSync(): void {
  if (started) return;
  started = true;
  let lastSong: string | undefined;
  let wasPlaying = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  player.subscribe(() => {
    const { queue, playing } = player.getState();
    const song = queue.current?.uid;
    if (song !== lastSong || (wasPlaying && !playing)) void pushQueue();
    lastSong = song;
    if (playing !== wasPlaying) {
      clearInterval(timer);
      if (playing) timer = setInterval(() => void pushQueue(), SAVE_EVERY_MS);
    }
    wasPlaying = playing;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void pushQueue(true);
    else void pullQueue();
  });
  window.addEventListener("pagehide", () => void pushQueue(true));
  window.addEventListener("focus", () => void pullQueue());
  window.addEventListener("online", () => void pullQueue(true));
  void pullQueue(true);
}
