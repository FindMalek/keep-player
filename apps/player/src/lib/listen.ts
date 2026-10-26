import {
  clockOffset,
  correction,
  expectedPosition,
  type HostState,
  type ListenSong,
  type Member,
  type ServerMessage,
} from "@keep/shared/listen";
import { useSyncExternalStore } from "react";
import { player } from "./player";
import { HEADERS } from "./subsonic";
import type { Song } from "./types";

// Listen together: the host publishes what it plays, listeners follow and correct drift; anyone can ask for a song,
// the host's player adds it.

export type ListenStatus = "off" | "connecting" | "host" | "listener" | "ended" | "failed";

export interface ListenState {
  status: ListenStatus;
  code: string | null;
  members: Member[];
  anyoneCanSkip: boolean;
  /** Party mode: only the host's device plays; listeners control it. */
  partyMode: boolean;
  notes: string[];
}

/** Which session this tab is in, so a reload rejoins it (the server keeps a host's room for a minute). */
const REMEMBER = "keep-player:listen";

function remember(value: { code: string; host: boolean } | null): void {
  try {
    if (value) sessionStorage.setItem(REMEMBER, JSON.stringify(value));
    else sessionStorage.removeItem(REMEMBER);
  } catch {
    // Private mode: the session just won't survive a reload.
  }
}

const IDLE: ListenState = { status: "off", code: null, members: [], anyoneCanSkip: false, partyMode: false, notes: [] };
const HEARTBEAT_MS = 5000;
const FOLLOW_MS = 1500;

let state: ListenState = IDLE;
const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let stopHost: (() => void) | null = null;
let followTimer: ReturnType<typeof setInterval> | undefined;
let last: { state: HostState; stamped: number } | null = null;
let offset = 0;

function set(patch: Partial<ListenState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

const note = (text: string) => set({ notes: [...state.notes, text].slice(-5) });

const toListenSong = (song: Song): ListenSong => ({
  id: song.id,
  title: song.title,
  ...(song.artist ? { artist: song.artist } : {}),
  ...(song.album ? { album: song.album } : {}),
  ...(song.albumId ? { albumId: song.albumId } : {}),
  ...(song.coverArt ? { coverArt: song.coverArt } : {}),
  ...(song.duration ? { duration: song.duration } : {}),
});

function send(message: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function hostState(): HostState {
  const current = player.getState().queue.current?.song;
  return { song: current ? toListenSong(current) : null, position: player.getPosition(), playing: player.getState().playing };
}

function startHosting(): void {
  let key = "";
  const publish = (force: boolean) => {
    const now = hostState();
    const next = `${now.song?.id ?? ""}|${now.playing}`;
    if (force || next !== key) {
      key = next;
      send({ t: "state", state: now });
    }
  };
  const unsubscribe = player.subscribe(() => publish(false));
  const timer = setInterval(() => publish(true), HEARTBEAT_MS);
  publish(true);
  stopHost = () => {
    unsubscribe();
    clearInterval(timer);
    stopHost = null;
  };
}

const PARTY_REMOTE = {
  toggle: () => send({ t: "toggle" }),
  next: () => send({ t: "skip" }),
  previous: () => undefined,
  seek: () => undefined,
  play: (songs: Song[], start: number) => {
    const song = songs[start];
    if (song) listen.add(song);
  },
  add: (songs: Song[]) => {
    for (const song of songs) listen.add(song);
  },
};

function applyParty(): void {
  const party = state.status === "listener" && state.partyMode;
  if (party && !player.isRemote()) {
    if (player.getState().playing) player.toggle(false);
    player.setRemote(PARTY_REMOTE);
  } else if (!party && player.isRemote()) player.setRemote(null);
}

function follow(): void {
  if (!last || state.status !== "listener") return;
  const wanted = last.state;
  if (state.partyMode) {
    const at = expectedPosition(wanted, last.stamped, offset, Date.now());
    if (wanted.song && player.getState().queue.current?.song.id !== wanted.song.id) player.adopt([wanted.song as Song], 0, at);
    player.mirror(wanted.playing, at);
    return;
  }
  if (!wanted.song) {
    if (player.getState().playing) player.toggle(false);
    return;
  }
  const expected = expectedPosition(wanted, last.stamped, offset, Date.now());
  if (player.getState().queue.current?.song.id !== wanted.song.id) {
    player.play([wanted.song as Song], 0, { startAt: expected });
    if (!wanted.playing) player.toggle(false);
    return;
  }
  if (player.getState().playing !== wanted.playing) player.toggle(wanted.playing);
  const fix = correction(player.getPosition(), expected);
  if (wanted.playing && fix.kind === "seek") player.seek(fix.to);
}

function onMessage(message: ServerMessage): void {
  switch (message.t) {
    case "hello":
      offset = clockOffset(message.now, Date.now());
      set({ status: message.role, members: message.members, anyoneCanSkip: message.anyoneCanSkip, partyMode: message.partyMode });
      applyParty();
      if (message.role === "host") startHosting();
      else {
        if (message.state) last = { state: message.state, stamped: message.stamped };
        followTimer = setInterval(follow, FOLLOW_MS);
        follow();
      }
      return;
    case "state":
      offset = clockOffset(message.now, Date.now());
      last = { state: message.state, stamped: message.stamped };
      follow();
      return;
    case "members":
      set({ members: message.members });
      return;
    case "setting":
      set({ anyoneCanSkip: message.anyoneCanSkip, partyMode: message.partyMode });
      applyParty();
      follow();
      return;
    case "toggle":
      note(`${message.by} ${player.getState().playing ? "paused" : "played"}`);
      if (state.status === "host") player.toggle();
      return;
    case "add":
      note(`${message.by} added ${message.song.title}`);
      if (state.status === "host") player.addToQueue([message.song as Song]);
      return;
    case "skip":
      note(`${message.by} skipped`);
      if (state.status === "host") player.next();
      return;
    case "ended":
      remember(null);
      cleanup();
      set({ status: "ended" });
  }
}

function cleanup(): void {
  if (state.partyMode && state.status === "listener") player.setRemote(null);
  stopHost?.();
  clearInterval(followTimer);
  followTimer = undefined;
  last = null;
  const old = socket;
  socket = null;
  if (old && old.readyState <= WebSocket.OPEN) old.close();
}

function connect(code: string, host: boolean): void {
  set({ status: "connecting", code, members: [], notes: [] });
  remember({ code, host });
  const url = new URL(`/api/listen/${encodeURIComponent(code)}`, location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(url);
  socket = ws;
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(String(event.data)) as ServerMessage);
    } catch {}
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    cleanup();
    if (state.status !== "ended") set({ status: "failed" });
    remember(null);
  };
}

export const listen = {
  getState: (): ListenState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  async host(anyoneCanSkip = false, partyMode = false): Promise<string | null> {
    cleanup();
    set({ ...IDLE, anyoneCanSkip, partyMode, status: "connecting" });
    const response = await fetch("/api/listen", {
      method: "POST",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ anyoneCanSkip, partyMode }),
    }).catch(() => null);
    if (!response?.ok) {
      set({ status: "failed" });
      return null;
    }
    const { code } = (await response.json()) as { code: string };
    connect(code, true);
    return code;
  },
  join(code: string): void {
    cleanup();
    set({ ...IDLE });
    connect(code, false);
  },
  resume(): void {
    try {
      const saved = JSON.parse(sessionStorage.getItem(REMEMBER) ?? "null") as { code?: unknown; host?: unknown } | null;
      if (typeof saved?.code === "string" && state.status === "off") connect(saved.code, saved.host === true);
    } catch {
      remember(null);
    }
  },
  leave(): void {
    if (state.status === "host") send({ t: "end" });
    remember(null);
    cleanup();
    set({ ...IDLE });
  },
  add: (song: Song) => send({ t: "add", song: toListenSong(song) }),
  skip: () => send({ t: "skip" }),
  setAnyoneCanSkip(value: boolean): void {
    send({ t: "setting", anyoneCanSkip: value });
  },
  setPartyMode(value: boolean): void {
    send({ t: "setting", partyMode: value });
  },
  toggle: () => send({ t: "toggle" }),
};

export function useListen(): ListenState {
  return useSyncExternalStore(listen.subscribe, listen.getState);
}
