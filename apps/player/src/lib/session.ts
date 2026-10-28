import {
  type Device,
  type DeviceCommand,
  type DeviceServerMessage,
  type DeviceSong,
  type DeviceState,
  MAX_PLAY_SONGS,
  MAX_STATE_SONGS,
} from "@lodesong/shared/devices";
import { clockOffset, expectedPosition } from "@lodesong/shared/listen";
import { apiQueries } from "./api-queries";
import { notify } from "./notify";
import { player } from "./player";
import { queryClient } from "./queries";
import * as Q from "./queue";
import { sessionState } from "./session-state";
import type { Song } from "./types";

// One playback session across devices: the playing tab publishes its queue and playhead, the others mirror it and
// send their button presses to it.

const ID_KEY = "keep-player:device";
const HEARTBEAT_MS = 5000;
const MIRROR_MS = 1000;
const RETRY_MS = [1000, 5000, 15_000, 60_000];

const CLAIM_KEY = "keep-player:device-claim:";
const CLAIM_MS = 10_000;

const random = () => crypto.randomUUID().slice(0, 12);

// Per tab in sessionStorage so a reload stays the same device; a duplicated tab copies it, so each tab also claims its
// id in localStorage (dropped on pagehide) and picks a new one if it's taken.
function deviceId(): string {
  try {
    let id = sessionStorage.getItem(ID_KEY);
    const claimed = id ? Number(localStorage.getItem(CLAIM_KEY + id) || 0) : 0;
    if (!id || Date.now() - claimed < CLAIM_MS) {
      id = random();
      sessionStorage.setItem(ID_KEY, id);
    }
    const key = CLAIM_KEY + id;
    const claim = () => localStorage.setItem(key, String(Date.now()));
    claim();
    setInterval(claim, CLAIM_MS / 2);
    window.addEventListener("pagehide", () => localStorage.removeItem(key));
    window.addEventListener("pageshow", (event) => event.persisted && claim());
    return id;
  } catch {
    return random();
  }
}

export function deviceLabel(ua: string): string {
  if (/lodesong-desktop/i.test(ua)) return "the desktop app";
  const browser = /Edg\//.test(ua)
    ? "edge"
    : /Firefox\//.test(ua)
      ? "firefox"
      : /Chrome\//.test(ua)
        ? "chrome"
        : /Safari\//.test(ua)
          ? "safari"
          : "a browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iphone"
    : /Android/.test(ua)
      ? "android"
      : /Mac OS X/.test(ua)
        ? "mac"
        : /Windows/.test(ua)
          ? "windows"
          : /Linux/.test(ua)
            ? "linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

let socket: WebSocket | null = null;
let last: { state: DeviceState; stamped: number } | null = null;
let offset = 0;
let mirrorTimer: ReturnType<typeof setInterval> | undefined;
/** The queue a remote last took over: compared with what the playing device sends, not with ours (shuffle reorders). */
let mirrored = "";

function send(message: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

const activeDevice = (): Device | undefined => sessionState.get().devices.find((device) => device.active);
const remoteOf = (): Device | undefined => {
  const active = activeDevice();
  return active && active.id !== sessionState.get().you ? active : undefined;
};

const toDeviceSong = (song: Song): DeviceSong => ({
  id: song.id,
  title: song.title,
  ...(song.artist ? { artist: song.artist } : {}),
  ...(song.artistId ? { artistId: song.artistId } : {}),
  ...(song.album ? { album: song.album } : {}),
  ...(song.albumId ? { albumId: song.albumId } : {}),
  ...(song.coverArt ? { coverArt: song.coverArt } : {}),
  ...(song.duration ? { duration: song.duration } : {}),
  ...(song.track ? { track: song.track } : {}),
  ...(song.discNumber ? { discNumber: song.discNumber } : {}),
  ...(song.suffix ? { suffix: song.suffix } : {}),
  ...(song.bitRate ? { bitRate: song.bitRate } : {}),
  ...(song.replayGain ? { replayGain: song.replayGain } : {}),
});

function snapshot(): DeviceState | null {
  const { queue, playing } = player.getState();
  if (!queue.current) return null;
  const entries = [queue.current, ...queue.upNext, ...Q.contextUpcoming(queue)].slice(0, MAX_STATE_SONGS);
  return { songs: entries.map((entry) => toDeviceSong(entry.song)), position: player.getPosition(), playing };
}

const ids = (songs: { id: string }[]) => songs.map((song) => song.id).join(",");

function upcomingHere(): string {
  const { queue } = player.getState();
  if (!queue.current) return "";
  return ids([queue.current, ...queue.upNext, ...Q.contextUpcoming(queue)].slice(0, MAX_STATE_SONGS).map((entry) => entry.song));
}

function mirror(): void {
  if (!last || !remoteOf()) return;
  const wanted = last.state;
  const at = expectedPosition({ song: null, ...wanted }, last.stamped, offset, Date.now());
  if (wanted.songs.length && ids(wanted.songs) !== mirrored) {
    mirrored = ids(wanted.songs);
    player.adopt(wanted.songs as Song[], 0, at);
  }
  player.mirror(wanted.playing, at);
}

function startPublishing(): void {
  let key = "";
  const publish = (force: boolean) => {
    if (remoteOf()) return;
    const now = snapshot();
    if (!now) return;
    if (!now.playing && activeDevice()?.id !== sessionState.get().you) return;
    const next = `${upcomingHere()}|${now.playing}`;
    if (force || next !== key) {
      key = next;
      send({ t: "state", state: now });
    }
  };
  player.subscribe(() => publish(false));
  setInterval(() => player.getState().playing && publish(true), HEARTBEAT_MS);
  // A seek doesn't change the song or play state; the remotes still need the new playhead.
  player.element().addEventListener("seeked", () => publish(true));
}

const command = (value: DeviceCommand) => send({ t: "command", command: value });

const REMOTE = {
  toggle: (playing: boolean) => {
    player.mirror(playing, player.getPosition());
    command({ action: "toggle", playing });
  },
  next: () => command({ action: "next" }),
  previous: () => command({ action: "previous" }),
  seek: (seconds: number) => command({ action: "seek", to: seconds }),
  play: (songs: Song[], start: number, options: { shuffle?: boolean; source?: Q.QueueSource }) => {
    const from = Math.max(0, start - Math.floor(MAX_PLAY_SONGS / 2));
    const list = songs.slice(from, from + MAX_PLAY_SONGS);
    command({
      action: "play",
      songs: list.map(toDeviceSong),
      start: start - from,
      shuffle: options.shuffle === true,
      ...(options.source
        ? {
            source: { kind: options.source.kind, name: options.source.name, ...(options.source.href ? { href: options.source.href } : {}) },
          }
        : {}),
    });
  },
  add: (songs: Song[], next: boolean) => {
    command({ action: "add", songs: songs.slice(0, MAX_PLAY_SONGS).map(toDeviceSong), next });
    notify({
      message: `${songs.length === 1 ? songs[0]?.title : `${songs.length} songs`} ${next ? "plays next" : "added"} on ${remoteOf()?.name}`,
    });
  },
};

function applyRole(): void {
  const remote = remoteOf();
  if (remote && !player.isRemote()) {
    if (!player.element().paused) player.toggle(false);
    player.setRemote(REMOTE);
    clearInterval(mirrorTimer);
    mirrorTimer = setInterval(mirror, MIRROR_MS);
    mirror();
  } else if (!remote && player.isRemote()) {
    player.setRemote(null);
    clearInterval(mirrorTimer);
    mirrored = "";
    player.mirror(false, player.getPosition());
  }
}

function run(value: DeviceCommand): void {
  if (value.action === "toggle") player.toggle(value.playing);
  else if (value.action === "next") player.next();
  else if (value.action === "previous") player.previous();
  else if (value.action === "seek") player.seek(value.to);
  else if (value.action === "play")
    player.play(value.songs as Song[], value.start, {
      shuffle: value.shuffle,
      ...(value.source ? { source: value.source as Q.QueueSource } : {}),
    });
  else if (value.next) player.playNext(value.songs as Song[]);
  else player.addToQueue(value.songs as Song[]);
}

function onMessage(message: DeviceServerMessage): void {
  switch (message.t) {
    case "devices":
      sessionState.set({ devices: message.devices });
      applyRole();
      return;
    case "state":
      offset = clockOffset(message.now, Date.now());
      last = { state: message.state, stamped: message.stamped };
      mirror();
      return;
    case "command":
      if (!remoteOf()) run(message.command);
      return;
    case "yield":
      if (!player.element().paused) player.toggle(false);
      return;
    case "take": {
      offset = clockOffset(message.now, Date.now());
      player.setRemote(null);
      clearInterval(mirrorTimer);
      const wanted = message.state;
      if (!wanted?.songs.length) return;
      const at = expectedPosition({ song: null, ...wanted }, message.stamped, offset, Date.now());
      if (ids(wanted.songs) !== upcomingHere()) player.adopt(wanted.songs as Song[], 0, at);
      else player.seek(at);
      player.takenOverAt(at);
      if (wanted.playing) player.toggle(true);
    }
  }
}

let attempt = 0;

function connect(): void {
  const url = new URL("/api/devices", location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("id", sessionState.get().you);
  url.searchParams.set("name", deviceLabel(navigator.userAgent));
  const ws = new WebSocket(url);
  socket = ws;
  ws.onopen = () => {
    attempt = 0;
    sessionState.set({ connected: true });
    const now = snapshot();
    if (now?.playing) send({ t: "state", state: now });
  };
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(String(event.data)) as DeviceServerMessage);
    } catch {}
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    sessionState.set({ connected: false, devices: [] });
    applyRole();
    setTimeout(connect, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
  };
}

let started = false;

export const session = {
  async start(): Promise<void> {
    if (started) return;
    started = true;
    // Off on this server (ONE_SESSION=off): every tab keeps playing on its own.
    const signedIn = await queryClient.fetchQuery(apiQueries.session()).catch(() => null);
    if (!signedIn?.oneSession) return;
    sessionState.set({ you: deviceId() });
    startPublishing();
    connect();
  },
  transfer(to: string): void {
    send({ t: "transfer", to });
  },
};
