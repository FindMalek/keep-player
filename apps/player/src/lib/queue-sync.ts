import { deviceName } from "./elsewhere";
import { clock } from "./format";
import { notify } from "./notify";
import { player } from "./player";
import * as Q from "./queue";
import { getSetting } from "./settings";
import { api, CLIENT_NAME, HEADERS } from "./subsonic";
import type { Song } from "./types";

// Queue hand-off with every Subsonic client: save on pause, new song, every 15 s and on leave; read on load, focus
// and online, and offer a newer one. Never yanks playback: while this tab plays it only asks.

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
  } catch {}
};

let byIndex: Promise<boolean> | null = null;
function indexBased(): Promise<boolean> {
  byIndex ??= api<{ openSubsonicExtensions?: { name: string }[] }>("getOpenSubsonicExtensions")
    .then((response) => Boolean(response.openSubsonicExtensions?.some((extension) => extension.name === "indexBasedQueue")))
    .catch(() => false);
  return byIndex;
}

function snapshot(): { ids: string[]; position: number } | null {
  const { queue } = player.getState();
  if (!queue.current) return null;
  const entries = [queue.current, ...queue.upNext, ...Q.contextUpcoming(queue)].slice(0, MAX_ENTRIES);
  return { ids: entries.map((entry) => entry.song.id), position: Math.round(player.getPosition() * 1000) };
}

// A form POST so a long queue never hits a URL limit; `keepalive` survives the tab closing.
export async function pushQueue(keepalive = false): Promise<void> {
  if (!getSetting("queueSync") || player.isRemote()) return;
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

export async function pullQueue(force = false): Promise<void> {
  if (!getSetting("queueSync") || player.isRemote() || (!force && Date.now() - lastPull < PULL_THROTTLE_MS)) return;
  lastPull = Date.now();
  const remote = await readRemote().catch(() => null);
  if (!remote || remote.changedBy === CLIENT_NAME || remote.changed === stored(DISMISSED_KEY)) return;
  if (Date.parse(remote.changed) <= Number(stored(SAVED_KEY) || 0)) return;
  const song = remote.songs[remote.index];
  if (!song) return;
  const state = player.getState();
  if (state.queue.current?.song.id === song.id && Math.abs(player.getPosition() * 1000 - remote.position) < 10_000) return;
  const take = () => player.adopt(remote.songs, remote.index, remote.position / 1000);
  if (!state.playing && getSetting("followOtherDevices")) {
    take();
    return;
  }
  notify({
    message: `continue from ${deviceName(remote.changedBy)} · ${song.title} at ${clock(remote.position / 1000)}`,
    duration: 20_000,
    id: "queue-handoff",
    action: { label: "resume here", onClick: take },
    cancel: { label: "keep mine", onClick: () => store(DISMISSED_KEY, remote.changed) },
  });
}

let started = false;

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
