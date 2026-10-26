import { del, get, set as setStored } from "idb-keyval";
import { useRef, useSyncExternalStore } from "react";
import type { FrameSource } from "./audio/types";
import { fadeBetween } from "./crossfade";
import { Decks } from "./decks";
import { fromDb } from "./eq";
import { notify } from "./notify";
import { controlled, dropPrecache, isCached, onCacheChange, pausePrecache, precache } from "./offline";
import { isHidden, songPref } from "./prefs";
import { queries, queryClient } from "./queries";
import * as Q from "./queue";
import { getSetting, subscribeSettings } from "./settings";
import { api, coverUrl, fallBackToTranscode, onAccountChange, preloadCover, qualityOf, scrobble, streamUrl } from "./subsonic";
import type { Song } from "./types";
import { done, record } from "./undo";

export type { Entry, QueueSource } from "./queue";

export interface PlayerState {
  queue: Q.Queue;
  playing: boolean;
  buffering: boolean;
  duration: number;
  volume: number;
  muted: boolean;
  outputDevice: string | null;
  error: string | null;
  sleep: Sleep;
}

export interface Remote {
  toggle(playing: boolean): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  play(songs: Song[], start: number, options: { shuffle?: boolean; source?: Q.QueueSource }): void;
  add(songs: Song[], next: boolean): void;
}

let remote: Remote | null = null;

export type Sleep = { kind: "time"; until: number } | { kind: "track" } | { kind: "album" } | null;

/** The queue lives in IndexedDB: a shuffled library is too big for localStorage, and writes don't block the page. */
const STORAGE_KEY = "keep-player:player";
const SCROBBLE_AFTER_SEC = 240;

let state: PlayerState = {
  queue: Q.EMPTY_QUEUE,
  playing: false,
  buffering: false,
  duration: 0,
  volume: 0.8,
  muted: false,
  outputDevice: null,
  error: null,
  sleep: null,
};
const listeners = new Set<() => void>();

let scrobbled = false;

function set(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

// Position lives outside `state`: it changes every frame and only the seek bar, time and lyrics need it.
let position = 0;
const positionListeners = new Set<() => void>();
let frame = 0;

function checkTrimEnd(seconds: number): void {
  const song = current();
  const end = song ? songPref(song.id)?.trimEnd : null;
  if (song && end && seconds >= end && state.playing && trimmed !== song.id) {
    trimmed = song.id;
    onEnded();
  }
}
let trimmed: string | null = null;

function setPosition(seconds: number): void {
  if (seconds === position) return;
  position = seconds;
  for (const listener of positionListeners) listener();
}

/** Follow the audio clock every frame while visible; hidden tabs fall back to `timeupdate` (about 4/s, throttled). */
function tick(): void {
  frame = 0;
  if (decks.element.paused || document.hidden) return;
  setPosition(decks.element.currentTime);
  checkTrimEnd(decks.element.currentTime);
  decks.tick();
  frame = requestAnimationFrame(tick);
}

function startTicker(): void {
  if (!frame) frame = requestAnimationFrame(tick);
}

document.addEventListener("visibilitychange", () => !document.hidden && startTicker());

let persistQueued = false;

function writeSnapshot(): void {
  persistQueued = false;
  const { queue, volume, muted, outputDevice } = state;
  void setStored(STORAGE_KEY, { queue, position, volume, muted, outputDevice }).catch(() => undefined);
}

function persist(): void {
  if (persistQueued) return;
  persistQueued = true;
  if ("requestIdleCallback" in window) requestIdleCallback(writeSnapshot, { timeout: 2000 });
  else setTimeout(writeSnapshot, 500);
}

window.addEventListener("pagehide", writeSnapshot);

type Snapshot = Pick<PlayerState, "queue" | "volume" | "muted" | "outputDevice"> & { position: number };

void get<Snapshot>(STORAGE_KEY)
  .then((saved) => {
    if (!saved?.queue || state.queue.current) return;
    position = saved.position ?? 0;
    set({
      queue: { ...Q.EMPTY_QUEUE, ...saved.queue },
      volume: saved.volume ?? state.volume,
      muted: Boolean(saved.muted),
      outputDevice: saved.outputDevice ?? null,
      duration: saved.queue.current?.song.duration ?? 0,
    });
    for (const listener of positionListeners) listener();
  })
  .catch(() => undefined);
try {
  localStorage.removeItem("keep-player:state");
} catch {
  // Nothing to clean up.
}

// Another account (or logout): its queue isn't yours.
onAccountChange(async () => {
  player.clear();
  await del(STORAGE_KEY).catch(() => undefined);
});

function current(): Song | undefined {
  return state.queue.current?.song;
}

function setQueue(queue: Q.Queue): void {
  set({ queue });
  persist();
}

function edit(queue: Q.Queue): void {
  setQueue(queue);
  preloadNext();
}

function replayGainFactor(song: Song | undefined, album: boolean): number {
  const rg = song?.replayGain;
  if (!rg) return 1;
  const db = album ? (rg.albumGain ?? rg.trackGain) : (rg.trackGain ?? rg.albumGain);
  const peak = album ? (rg.albumPeak ?? rg.trackPeak) : (rg.trackPeak ?? rg.albumPeak);
  if (db === undefined) return 1;
  const factor = 10 ** (db / 20);
  return peak ? Math.min(factor, 1 / peak) : factor;
}

function gainFactor(song: Song | undefined, album: boolean): number {
  const mode = getSetting("normalization");
  const preamp = fromDb(getSetting("preamp"));
  if (mode === "off") return preamp;
  return replayGainFactor(song, mode === "album" ? true : mode === "track" ? false : album) * preamp;
}

export function appliedGain(): { mode: "album" | "track" | "off"; db: number } | null {
  const song = current();
  const album = state.queue.context.album && state.queue.current?.from === "context";
  const mode = getSetting("normalization");
  const db = 20 * Math.log10(gainFactor(song, album));
  if (mode === "off") return getSetting("preamp") === 0 ? null : { mode: "off", db };
  const rg = song?.replayGain;
  if (!rg || (rg.trackGain === undefined && rg.albumGain === undefined)) return getSetting("preamp") === 0 ? null : { mode: "off", db };
  const useAlbum = mode === "album" ? true : mode === "track" ? false : album;
  return { mode: useAlbum && rg.albumGain !== undefined ? "album" : "track", db };
}

const currentFactor = () => gainFactor(current(), state.queue.context.album && state.queue.current?.from === "context");

const decks = new Decks({
  playing: () => {
    set({ playing: true, buffering: false, error: null });
    // `waiting` paused the downloads; playing resumes them even when no `canplay` comes in between.
    pausePrecache(false);
    stalls = 0;
    clearTimeout(stallTimer);
    startTicker();
    updatePositionState();
  },
  pause: () => {
    setPosition(decks.element.currentTime);
    set({ playing: false });
    persist();
    updatePositionState();
  },
  waiting: () => {
    set({ buffering: true });
    pausePrecache(true);
    watchStall();
  },
  canPlay: () => {
    set({ buffering: false });
    pausePrecache(false);
    clearTimeout(stallTimer);
    preloadNext();
  },
  progress: () => {
    // Bytes are still arriving: a slow stream isn't a dead one.
    if (state.buffering) watchStall();
    if (!nextLined && decks.bufferedAhead(SAFE_AHEAD_SECONDS)) preloadNext();
  },
  duration: (seconds) => set({ duration: seconds || (current()?.duration ?? 0) }),
  time: (seconds) => {
    if (document.hidden) setPosition(seconds);
    checkTrimEnd(seconds);
    const left = decks.element.duration - seconds;
    if (Number.isFinite(left) && left < DIRECT_PRELOAD_SECONDS) lineUpNextDeck(true);
    const song = current();
    const duration = decks.element.duration;
    if (song && !scrobbled && (seconds >= SCROBBLE_AFTER_SEC || (duration > 0 && seconds >= duration / 2))) {
      scrobbled = true;
      scrobble(song.id, true);
    }
    if (performance.now() - lastSave > 5000) {
      lastSave = performance.now();
      persist();
    }
  },
  seeked: (seconds) => {
    setPosition(seconds);
    updatePositionState();
  },
  ended: onEnded,
  handover: () => {
    if (state.queue.repeat !== "one") setQueue(Q.next(state.queue));
    started(current());
  },
  error: () => void onMediaError(),
});

// Safari only lets audio start inside a tap or key press: unlock the engine on those, so the first play (which may
// come after a network wait) already has a running context.
for (const type of ["click", "touchend", "keydown"] as const)
  window.addEventListener(type, () => decks.unlock(), { capture: true, passive: true });

// Chrome reports a request that failed before any audio arrived as "source not supported", same as a real format
// problem, so for that code ask the server before giving up on the song.
async function onMediaError(): Promise<void> {
  const song = current();
  const code = decks.errorCode;
  if (!song || code === null) return;
  if (code === MediaError.MEDIA_ERR_DECODE) return unplayable(song, "the file can't be decoded");
  if (code === MediaError.MEDIA_ERR_NETWORK) return recover();
  const { verdict, type } = await probe(streamUrl(song.id));
  if (song !== current()) return;
  if (verdict === "missing") skipBroken("the server doesn't have the file");
  else if (verdict === "ok" && type && decks.element.canPlayType(type) === "") unplayable(song, "it's in a format this browser can't play");
  else recover();
}

// A song this browser can't play (ALAC in Firefox) is retried as a transcode before it is skipped.
function unplayable(song: Song, reason: string): void {
  if (qualityOf(song.id) !== "original") {
    skipBroken(reason);
    return;
  }
  fallBackToTranscode(song.id);
  notify({ message: `${song.title} plays transcoded: this browser can't play its format` });
  set({ buffering: true, error: null });
  decks.reload(streamUrl(song.id), position);
  watchStall();
}

async function probe(url: string): Promise<{ verdict: "ok" | "missing" | "network"; type: string | null }> {
  const response = await fetch(url, { headers: { range: "bytes=0-1" }, cache: "no-store", signal: AbortSignal.timeout(10_000) }).catch(
    () => null,
  );
  if (!response) return { verdict: "network", type: null };
  void response.body?.cancel();
  const type = response.headers.get("content-type")?.split(";")[0]?.trim() || null;
  if (response.status === 404 || response.status === 410) return { verdict: "missing", type };
  return { verdict: response.ok ? "ok" : "network", type };
}

// A stall (no new bytes for 8 s) or network error reloads at the same spot with 1/2/4/8 s backoff, then skips with
// an undo. A slow but moving stream is left alone: reloading would throw away what it has.
const RETRY_DELAYS = [1000, 2000, 4000, 8000];
const STALL_MS = 8000;
let stalls = 0;
let stallTimer: ReturnType<typeof setTimeout> | undefined;
let lastSave = 0;

function watchStall(): void {
  clearTimeout(stallTimer);
  stallTimer = setTimeout(() => state.buffering && recover(), STALL_MS);
}

function recover(): void {
  const song = current();
  if (!song) return;
  clearTimeout(stallTimer);
  const delay = RETRY_DELAYS[stalls];
  if (delay === undefined) {
    skipBroken("it couldn't be loaded");
    return;
  }
  stalls += 1;
  set({ buffering: true, error: null });
  const at = position;
  stallTimer = setTimeout(() => {
    if (current() !== song) return;
    decks.reload(streamUrl(song.id), at);
    watchStall();
  }, delay);
}

function skipBroken(reason: string): void {
  const song = current();
  stalls = 0;
  clearTimeout(stallTimer);
  set({ playing: false, buffering: false, error: reason });
  if (!song) return;
  notify({
    kind: "error",
    message: `skipped ${song.title}: ${reason}`,
    action: { label: "undo", onClick: () => player.previous(true) },
  });
  if (Q.peekNext(state.queue)) advance(Q.next(state.queue));
}

window.addEventListener("online", () => {
  if (state.error || state.buffering) {
    stalls = 0;
    recover();
  }
});

function applyVolume(): void {
  decks.setVolume(state.muted ? 0 : state.volume);
  decks.setFactor(currentFactor());
}

function applyOutputDevice(): void {
  void decks.setSink(state.outputDevice ?? "").catch(() => set({ outputDevice: null }));
}

function upcoming(): { song: Song; factor: number } | null {
  const { queue } = state;
  if (stopsAfterThis()) return null;
  if (queue.repeat === "one") {
    const song = current();
    return song ? { song, factor: currentFactor() } : null;
  }
  const song = Q.peekNext(queue);
  if (!song) return null;
  const fromContext = queue.upNext.length === 0;
  return { song, factor: gainFactor(song, fromContext && queue.context.album) };
}

function stopsAfterThis(): boolean {
  const { sleep } = state;
  if (sleep?.kind === "track") return true;
  if (sleep?.kind === "album") return Q.peekNext(state.queue)?.albumId !== current()?.albumId;
  return false;
}

const PRECACHE_AHEAD = 3;
/** Buffered past the playhead before anything else downloads, so the next songs never starve the playing one. */
const SAFE_AHEAD_SECONDS = 30;
const DIRECT_PRELOAD_SECONDS = 45;
let nextLined = false;

// Line up the next songs once the playing one is buffered: the service worker precaches them and the idle deck takes
// the next one from that cache so it isn't downloaded twice (no service worker or near the end: from the network).
function preloadNext(): void {
  if (!current()) return;
  const next = upcoming();
  if (!decks.bufferedAhead(SAFE_AHEAD_SECONDS)) {
    if (decks.preloadedId && decks.preloadedId !== next?.song.id) decks.preload(null, null, 1);
    return;
  }
  nextLined = true;
  lineUpNextDeck(false);
  precache(
    Q.peekUpcoming(state.queue, PRECACHE_AHEAD)
      .map((song) => song.id)
      .filter((id) => id !== decks.preloadedId && qualityOf(id) === "original"),
  );
  preloadCover(next?.song.coverArt, 42);
}

function lineUpNextDeck(now: boolean): void {
  const next = upcoming();
  if (decks.preloadedId === (next?.song.id ?? null)) {
    if (next) decks.preload(next.song.id, null, next.factor, 0, fadeBetween(getSetting("crossfade"), current(), next.song));
    return;
  }
  // Only the original file comes from the service worker's cache; a transcode always streams from the network.
  const cacheable = next ? qualityOf(next.song.id) === "original" : false;
  if (next && !now && controlled() && cacheable && !isCached(next.song.id)) {
    if (decks.preloadedId) decks.preload(null, null, 1);
    return;
  }
  // Straight from the network: if the service worker is fetching the same song, it stops (one download, not two).
  if (next && controlled() && cacheable && !isCached(next.song.id)) dropPrecache(next.song.id);
  decks.preload(
    next?.song.id ?? null,
    next ? streamUrl(next.song.id) : null,
    next?.factor ?? 1,
    (next && songPref(next.song.id)?.trimStart) || 0,
    fadeBetween(getSetting("crossfade"), current(), next?.song),
  );
}

decks.setFadesSkips(getSetting("crossfade") > 0);
let lastQuality = getSetting("streamQuality");
subscribeSettings(() => {
  decks.setFadesSkips(getSetting("crossfade") > 0);
  if (getSetting("streamQuality") !== lastQuality) {
    lastQuality = getSetting("streamQuality");
    decks.preload(null, null, 1);
    if (nextLined) lineUpNextDeck(true);
  }
  decks.setEq(getSetting("eqOn"), getSetting("eqGains"));
  decks.setFactor(currentFactor());
  if (nextLined) lineUpNextDeck(false);
});
decks.setEq(getSetting("eqOn"), getSetting("eqGains"));

onCacheChange(() => nextLined && lineUpNextDeck(false));

function started(song: Song | undefined): void {
  scrobbled = false;
  nextLined = false;
  trimmed = null;
  setPosition((song && songPref(song.id)?.trimStart) || 0);
  set({ duration: song?.duration ?? 0, error: null });
  applyVolume();
  updateMediaSession();
  persist();
  if (song && !remote) scrobble(song.id, false);
  preloadNext();
  // Lyrics for this song and the next two; also the current song when it was loaded paused.
  const playing = song ?? current();
  for (const next of [...(playing ? [playing] : []), ...Q.peekUpcoming(state.queue, 2)])
    void queryClient.prefetchQuery(queries.lyrics(next.id));
}

function load(autoplay: boolean, startAt = 0): void {
  const song = current();
  if (!song) return;
  const from = startAt || songPref(song.id)?.trimStart || 0;
  decks.load(song.id, streamUrl(song.id), currentFactor(), from, false);
  set({ buffering: autoplay });
  started(autoplay ? song : undefined);
  if (!autoplay) {
    set({ duration: song.duration ?? 0 });
    updateMediaSession();
  }
  setPosition(from);
  if (autoplay) void decks.play().catch(() => set({ playing: false, buffering: false }));
}

function advance(queue: Q.Queue, startAt = 0): void {
  setQueue(queue);
  if (queue.current) load(true, startAt);
  else {
    decks.pause();
    decks.preload(null, null, 1);
    set({ playing: false });
    setPosition(0);
  }
}

function onEnded(): void {
  if (stopsAfterThis()) {
    set({ sleep: null, playing: false });
    if (Q.peekNext(state.queue)) {
      setQueue(Q.next(state.queue));
      load(false);
    }
    return;
  }
  if (state.queue.repeat === "one") load(true);
  else advance(Q.next(state.queue));
}

function restoreQueue(snapshot: Q.Queue, fallback: () => Q.Queue): void {
  edit(state.queue.current?.uid === snapshot.current?.uid ? snapshot : fallback());
}

function queued(next: Q.Queue, where: string, reapply: (queue: Q.Queue) => Q.Queue): void {
  const before = state.queue;
  const uids = new Set(before.upNext.map((entry) => entry.uid));
  edit(next);
  let added = next.upNext.filter((entry) => !uids.has(entry.uid));
  if (!added.length) return;
  const after = next;
  done({
    label: `added ${added.length === 1 ? (added[0] as Q.Entry).song.title : `${added.length} songs`} ${where}`,
    undo: () => restoreQueue(before, () => added.reduce((queue, entry) => Q.remove(queue, entry), state.queue)),
    redo: () =>
      restoreQueue(after, () => {
        const known = new Set(state.queue.upNext.map((entry) => entry.uid));
        const queue = reapply(state.queue);
        added = queue.upNext.filter((entry) => !known.has(entry.uid));
        return queue;
      }),
  });
}

function removed(next: Q.Queue, message: string): void {
  const before = state.queue;
  const upcoming = (queue: Q.Queue) => [...queue.upNext, ...Q.contextUpcoming(queue)];
  const left = new Set(upcoming(next).map((entry) => entry.uid));
  const gone = upcoming(before).filter((entry) => !left.has(entry.uid));
  edit(next);
  if (!gone.length) return;
  let restored: Q.Entry[] = [];
  done({
    label: message,
    undo: () =>
      restoreQueue(before, () => {
        const known = new Set(state.queue.upNext.map((entry) => entry.uid));
        const queue = Q.addToQueue(
          state.queue,
          gone.map((entry) => entry.song),
        );
        restored = queue.upNext.filter((entry) => !known.has(entry.uid));
        return queue;
      }),
    redo: () => restoreQueue(next, () => restored.reduce((queue, entry) => Q.remove(queue, entry), state.queue)),
  });
}

function replacedContext(before: Q.Queue, at: number, label: string): void {
  if (!before.current) return;
  const after = state.queue;
  const back = (queue: Q.Queue, seconds: number) => {
    const playing = state.playing;
    setQueue(queue);
    load(playing, seconds);
    if (!playing) preloadNext();
  };
  const dropped = Q.contextUpcoming(before).length;
  const action = { label, undo: () => back(before, at), redo: () => back(after, 0) };
  if (dropped >= 10) done({ ...action, label: `${label} · ${dropped} songs from ${before.context.source?.name ?? "before"} dropped` });
  else record(action);
}

let sleepTimer: ReturnType<typeof setTimeout> | undefined;
const FADE_SECONDS = 10;

function armSleep(): void {
  clearTimeout(sleepTimer);
  const { sleep } = state;
  if (sleep?.kind !== "time") return;
  sleepTimer = setTimeout(
    async () => {
      if (state.playing) await decks.fade(0, FADE_SECONDS);
      if (state.sleep?.kind !== "time") return applyVolume();
      decks.pause();
      set({ sleep: null });
      applyVolume();
    },
    Math.max(0, sleep.until - Date.now() - FADE_SECONDS * 1000),
  );
}

function updateMediaSession(): void {
  const song = current();
  if (!("mediaSession" in navigator) || !song) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist ?? "",
    album: song.album ?? "",
    artwork: [128, 256, 512].flatMap((size) => {
      const src = coverUrl(song.coverArt, size);
      return src ? [{ src, sizes: `${size}x${size}`, type: "image/webp" }] : [];
    }),
  });
  updatePositionState();
}

function updatePositionState(): void {
  if (!("mediaSession" in navigator) || !state.duration) return;
  try {
    navigator.mediaSession.setPositionState({ duration: state.duration, position: Math.min(position, state.duration), playbackRate: 1 });
  } catch {
    // Some browsers reject a position past the reported duration for a moment after seeking.
  }
}

if ("mediaSession" in navigator) {
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ["play", () => player.toggle(true)],
    ["pause", () => player.toggle(false)],
    ["stop", () => player.toggle(false)],
    ["nexttrack", () => player.next()],
    ["previoustrack", () => player.previous()],
    ["seekbackward", (details) => player.seek(position - (details.seekOffset ?? 10))],
    ["seekforward", (details) => player.seek(position + (details.seekOffset ?? 10))],
    ["seekto", (details) => details.seekTime !== undefined && player.seek(details.seekTime)],
  ];
  for (const [action, handler] of handlers) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Not every browser knows every action.
    }
  }
}

export const player = {
  getState: (): PlayerState => state,
  getPosition: (): number => position,
  getBuffered: (): number => decks.buffered(),
  element: (): HTMLAudioElement => decks.element,
  levels: (listener: ((levels: number[]) => void) | null): Promise<void> => decks.levels(listener),
  setSleep(option: number | "track" | "album" | null): void {
    const sleep: Sleep =
      option === null ? null : typeof option === "number" ? { kind: "time", until: Date.now() + option * 60_000 } : { kind: option };
    set({ sleep });
    armSleep();
    applyVolume();
    preloadNext();
  },
  toggleStopAfterCurrent(): void {
    player.setSleep(state.sleep?.kind === "track" ? null : "track");
  },
  retry(): void {
    stalls = 0;
    set({ error: null });
    load(true, position);
  },
  setOutputDevice(id: string | null): void {
    set({ outputDevice: id });
    applyOutputDevice();
    persist();
  },
  play(all: Song[], start = 0, options: { shuffle?: boolean; album?: boolean; source?: Q.QueueSource; startAt?: number } = {}): void {
    if (remote) {
      remote.play(all, start, options);
      return;
    }
    // Songs you hid play only from their album's page (or when you pick one yourself).
    const chosen = all[start];
    const songs = options.album || options.source?.kind === "album" ? all : all.filter((song) => song === chosen || !isHidden(song.id));
    if (!songs.length) return;
    if (songs !== all && start >= 0) start = Math.max(0, songs.indexOf(chosen as Song));
    const before = state.queue;
    const at = position;
    advance(Q.playContext(state.queue, songs, start, options), options.startAt);
    replacedContext(before, at, `started ${options.source?.name ?? (songs[start] as Song | undefined)?.title ?? "playing"}`);
  },
  toggle(force?: boolean): void {
    if (remote) {
      remote.toggle(force ?? !state.playing);
      return;
    }
    if (!current()) return;
    const element = decks.element;
    const shouldPlay = force ?? element.paused;
    if (!shouldPlay) decks.pause();
    else if (!element.src) load(true, position);
    else void decks.play().catch(() => set({ playing: false }));
  },
  next(): void {
    if (remote) remote.next();
    else if (current()) advance(Q.next(state.queue));
  },
  previous(force = false): void {
    if (remote) {
      remote.previous();
      return;
    }
    if ((!force && position > 3) || state.queue.history.length === 0) {
      player.seek(0);
      return;
    }
    advance(Q.previous(state.queue));
  },
  jumpTo(entry: Q.Entry): void {
    advance(Q.jumpTo(state.queue, entry));
  },
  seek(seconds: number): void {
    if (remote) {
      remote.seek(seconds);
      return;
    }
    if (!current() || !decks.element.src) return;
    const target = Math.max(0, Math.min(seconds, state.duration || seconds));
    decks.seek(target);
    setPosition(target);
    updatePositionState();
  },
  setVolume(volume: number): void {
    set({ volume: Math.max(0, Math.min(1, volume)), muted: false });
    applyVolume();
    persist();
  },
  toggleMute(): void {
    set({ muted: !state.muted });
    applyVolume();
    persist();
  },
  toggleShuffle(): void {
    edit(Q.setShuffle(state.queue, !state.queue.shuffle));
    applyVolume();
  },
  setRepeat(repeat: Q.Repeat): void {
    edit({ ...state.queue, repeat });
  },
  cycleRepeat(): void {
    const { repeat } = state.queue;
    player.setRepeat(repeat === "off" ? "all" : repeat === "all" ? "one" : "off");
  },
  playNext(songs: Song[]): void {
    if (remote) {
      remote.add(songs, true);
      return;
    }
    if (!current()) player.play(songs);
    else queued(Q.playNext(state.queue, songs), "to play next", (queue) => Q.playNext(queue, songs));
  },
  addToQueue(songs: Song[]): void {
    if (remote) {
      remote.add(songs, false);
      return;
    }
    if (!current()) player.play(songs);
    else queued(Q.addToQueue(state.queue, songs), "to the queue", (queue) => Q.addToQueue(queue, songs));
  },
  move(entry: Q.Entry, delta: -1 | 1): void {
    const before = state.queue;
    const after = Q.move(before, entry, delta);
    if (after === before) return;
    edit(after);
    record({
      label: `moved ${entry.song.title}`,
      undo: () => restoreQueue(before, () => Q.move(state.queue, entry, delta === 1 ? -1 : 1)),
      redo: () => restoreQueue(after, () => Q.move(state.queue, entry, delta)),
    });
  },
  moveTo(entry: Q.Entry, to: Q.Entry): void {
    const before = state.queue;
    const after = Q.moveTo(before, entry, to);
    if (after === before) return;
    edit(after);
    // Undone only while the same song plays: positions mean nothing once the queue has moved on.
    record({
      label: `moved ${entry.song.title}`,
      undo: () => restoreQueue(before, () => state.queue),
      redo: () => restoreQueue(after, () => state.queue),
    });
  },
  appendToContext(songs: Song[]): void {
    if (songs.length) edit(Q.appendContext(state.queue, songs));
  },
  removeQuietly(entry: Q.Entry): void {
    edit(Q.remove(state.queue, entry));
  },
  adopt(songs: Song[], index: number, seconds: number): void {
    if (!songs.length) return;
    setQueue(Q.playContext(Q.clearUpNext(state.queue), songs, index, { source: { kind: "handoff", name: "your other device" } }));
    load(false, seconds);
  },
  setRemote(next: Remote | null): void {
    remote = next;
  },
  isRemote: (): boolean => remote !== null,
  takenOverAt(seconds: number): void {
    const duration = current()?.duration ?? 0;
    if (seconds >= SCROBBLE_AFTER_SEC || (duration > 0 && seconds >= duration / 2)) scrobbled = true;
  },
  mirror(playing: boolean, seconds: number): void {
    if (state.playing !== playing) set({ playing, buffering: false });
    setPosition(seconds);
  },
  subscribe(listener: () => void): () => void {
    return subscribe(listener);
  },
  remove(entry: Q.Entry): void {
    removed(Q.remove(state.queue, entry), `removed ${entry.song.title} from the queue`);
  },
  clearUpNext(): void {
    removed(Q.clearUpNext(state.queue), "cleared your queue");
  },
  clearContext(): void {
    const source = state.queue.context.source?.name;
    removed(Q.clearContext(state.queue), source ? `cleared what was next from ${source}` : "cleared what was next");
  },
  async saveAsPlaylist(name: string): Promise<void> {
    const { current: playing, upNext } = state.queue;
    const songs = [...(playing ? [playing] : []), ...upNext, ...Q.contextUpcoming(state.queue)].map((entry) => entry.song.id);
    await api("createPlaylist", { name, songId: songs });
  },
  clear(): void {
    decks.stop();
    set({ queue: { ...Q.EMPTY_QUEUE, shuffle: state.queue.shuffle, repeat: state.queue.repeat }, playing: false, duration: 0 });
    setPosition(0);
    persist();
  },
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function subscribePosition(listener: () => void): () => void {
  positionListeners.add(listener);
  return () => positionListeners.delete(listener);
}

function useSelected<S, T>(
  subscribeTo: (listener: () => void) => () => void,
  read: () => S,
  selector: (source: S) => T,
  isEqual: (a: T, b: T) => boolean,
): T {
  const last = useRef<{ source: S; selector: (source: S) => T; value: T } | null>(null);
  return useSyncExternalStore(subscribeTo, () => {
    const source = read();
    const cached = last.current;
    if (cached && cached.source === source && cached.selector === selector) return cached.value;
    const value = selector(source);
    if (cached && isEqual(cached.value, value)) {
      last.current = { source, selector, value: cached.value };
      return cached.value;
    }
    last.current = { source, selector, value };
    return value;
  });
}

export const positionFrames: FrameSource<number> = {
  subscribe(listener) {
    const forward = () => listener(position);
    positionListeners.add(forward);
    return () => positionListeners.delete(forward);
  },
};

export function usePlayer<T>(selector: (state: PlayerState) => T, isEqual: (a: T, b: T) => boolean = Object.is): T {
  return useSelected(subscribe, () => state, selector, isEqual);
}

export function usePosition<T = number>(selector: (seconds: number) => T = (seconds) => seconds as T): T {
  return useSelected(subscribePosition, () => position, selector, Object.is);
}

export function currentSong(value: PlayerState): Song | undefined {
  return value.queue.current?.song;
}
