import { del, get, set as setStored } from "idb-keyval";
import { useRef, useSyncExternalStore } from "react";
import type { FrameSource } from "./audio/types";
import { Decks } from "./decks";
import { notify } from "./notify";
import { controlled, isCached, onCacheChange, pausePrecache, precache } from "./offline";
import { queries, queryClient } from "./queries";
import * as Q from "./queue";
import { api, coverUrl, onAccountChange, preloadCover, scrobble, streamUrl } from "./subsonic";
import type { Song } from "./types";

export type { Entry, QueueSource, Repeat } from "./queue";

export interface PlayerState {
  queue: Q.Queue;
  playing: boolean;
  buffering: boolean;
  duration: number;
  volume: number;
  muted: boolean;
  /** Audio output device id; null is the system default. */
  outputDevice: string | null;
  /** Why the current song can't play, in plain words; null when fine. */
  error: string | null;
  sleep: Sleep;
}

/** Sleep timer: stop at a time (after a 10 s fade), at the end of this song, or at the end of the album. */
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

/*
 * Playback position lives outside the main state: it changes every frame, and only the seek bar, the time readout
 * and the lyrics care. Everything else subscribes to `state` and never re-renders while a song plays.
 */
let position = 0;
const positionListeners = new Set<() => void>();
let frame = 0;

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

/** The snapshot holds the whole queue, so write it once when the browser is idle, not on every change. */
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
    // Something already started playing while we were reading; keep that.
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
  // Older versions kept the queue in localStorage.
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

/** Queue edits that keep the current song (play next, remove, shuffle, …): the preloaded "next" may have changed. */
function edit(queue: Q.Queue): void {
  setQueue(queue);
  preloadNext();
}

/** dB → linear, clipped so the track's peak never exceeds full scale. `album`: use album gain (an album in order). */
function replayGainFactor(song: Song | undefined, album: boolean): number {
  const rg = song?.replayGain;
  if (!rg) return 1;
  const db = album ? (rg.albumGain ?? rg.trackGain) : (rg.trackGain ?? rg.albumGain);
  const peak = album ? (rg.albumPeak ?? rg.trackPeak) : (rg.trackPeak ?? rg.albumPeak);
  if (db === undefined) return 1;
  const factor = 10 ** (db / 20);
  return peak ? Math.min(factor, 1 / peak) : factor;
}

/** What ReplayGain does to the playing song, for the "now playing" card: which gain and how many dB, or null. */
export function appliedGain(): { mode: "album" | "track"; db: number } | null {
  const song = current();
  const album = state.queue.context.album && state.queue.current?.from === "context";
  const rg = song?.replayGain;
  if (!rg) return null;
  const db = album ? (rg.albumGain ?? rg.trackGain) : (rg.trackGain ?? rg.albumGain);
  if (db === undefined) return null;
  return { mode: album && rg.albumGain !== undefined ? "album" : "track", db: 20 * Math.log10(replayGainFactor(song, album)) };
}

/** Album gain only while an album plays in order from its context; queued songs in between use track gain. */
const currentFactor = () => replayGainFactor(current(), state.queue.context.album && state.queue.current?.from === "context");

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
    // The next song is due soon and still isn't in the idle deck (its precache is slow): load it straight away.
    const left = decks.element.duration - seconds;
    if (Number.isFinite(left) && left < DIRECT_PRELOAD_SECONDS) lineUpNextDeck(true);
    const song = current();
    const duration = decks.element.duration;
    if (song && !scrobbled && (seconds >= SCROBBLE_AFTER_SEC || (duration > 0 && seconds >= duration / 2))) {
      scrobbled = true;
      scrobble(song.id, true);
    }
    // A crash or a closed tab resumes within 5 s of where it was.
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
    // The next song is already playing: move the queue to match, then line up the one after it.
    if (state.queue.repeat !== "one") setQueue(Q.next(state.queue));
    started(current());
  },
  error: () => void onMediaError(),
});

/**
 * Network trouble is worth retrying; a file the browser can't decode or the server doesn't have is not. Chrome reports
 * a request that failed before any audio arrived (timeout, dropped connection, 502) as "source not supported", the
 * same as a real format problem, so for that code ask the server before giving up on the song.
 */
async function onMediaError(): Promise<void> {
  const song = current();
  const code = decks.errorCode;
  if (!song || code === null) return;
  if (code === MediaError.MEDIA_ERR_DECODE) return skipBroken("the file can't be decoded");
  if (code === MediaError.MEDIA_ERR_NETWORK) return recover();
  const { verdict, type } = await probe(streamUrl(song.id));
  if (song !== current()) return;
  if (verdict === "missing") skipBroken("the server doesn't have the file");
  // Only call it the format when the browser says so for the type the server sends; a slow or dropped connection
  // looks the same to Chrome, and that is retried (and skipped as "couldn't load" if it never comes through).
  else if (verdict === "ok" && type && decks.element.canPlayType(type) === "") skipBroken("it's in a format this browser can't play");
  else recover();
}

/** What the server says about a song's stream, from its first two bytes. */
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

/*
 * Resilience. A stall (buffering with no new bytes for 8 s) or a network error reloads the song at the same position,
 * waiting 1, 2, 4, then 8 s between tries; after that the song is skipped with an undo, so the music never just stops.
 * A stream that is slow but still moving is left alone: reloading it would throw away what it already has.
 */
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

// Back online or back in the tab: pick up a song that stalled meanwhile, at the same spot.
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

/** The song that plays when this one ends (the same one on repeat-one), and its gain. */
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
  return { song, factor: replayGainFactor(song, fromContext && queue.context.album) };
}

/** True when the sleep timer ends playback with the current song (end of track, or the album's last track). */
function stopsAfterThis(): boolean {
  const { sleep } = state;
  if (sleep?.kind === "track") return true;
  if (sleep?.kind === "album") return Q.peekNext(state.queue)?.albumId !== current()?.albumId;
  return false;
}

/** How many upcoming songs the service worker downloads ahead. */
const PRECACHE_AHEAD = 3;
/** Buffered past the playhead before anything else downloads, so the next songs never starve the playing one. */
const SAFE_AHEAD_SECONDS = 30;
/** This close to the end, the next song goes into the idle deck from the network even if its precache isn't done. */
const DIRECT_PRELOAD_SECONDS = 45;
/** Whether the next songs were lined up for the playing one (reset when a song starts). */
let nextLined = false;

/**
 * Line up what plays next, once the playing song is safely buffered: the service worker downloads the next few (one
 * at a time, low priority), and the idle deck takes the next song from that cache when it lands there, so it isn't
 * downloaded twice. Without a service worker, or close to the end, the deck loads it straight from the network.
 * Called whenever the queue changes and as the playing song's download moves on.
 */
function preloadNext(): void {
  if (!current()) return;
  const next = upcoming();
  if (!decks.bufferedAhead(SAFE_AHEAD_SECONDS)) {
    // Not yet: and a deck holding a song that no longer comes next would compete for nothing.
    if (decks.preloadedId && decks.preloadedId !== next?.song.id) decks.preload(null, null, 1);
    return;
  }
  nextLined = true;
  lineUpNextDeck(false);
  // A song the idle deck already loads from the network isn't downloaded a second time.
  precache(
    Q.peekUpcoming(state.queue, PRECACHE_AHEAD)
      .map((song) => song.id)
      .filter((id) => id !== decks.preloadedId),
  );
  // The player bar shows the next cover within minutes; have it cached by then.
  preloadCover(next?.song.coverArt, 42);
}

/** Put the next song in the idle deck, from the cache when the service worker has it (or `now`: from the network). */
function lineUpNextDeck(now: boolean): void {
  const next = upcoming();
  if (decks.preloadedId === (next?.song.id ?? null)) return;
  if (next && !now && controlled() && !isCached(next.song.id)) {
    // Waiting for the cache: a deck still holding the old "next" would keep downloading it for nothing.
    if (decks.preloadedId) decks.preload(null, null, 1);
    return;
  }
  decks.preload(next?.song.id ?? null, next ? streamUrl(next.song.id) : null, next?.factor ?? 1);
}

// The service worker saved another song: it may be the one the idle deck is waiting for.
onCacheChange(() => nextLined && lineUpNextDeck(false));

/** Bookkeeping when a song starts (loaded or handed over gaplessly). */
function started(song: Song | undefined): void {
  scrobbled = false;
  nextLined = false;
  setPosition(0);
  set({ duration: song?.duration ?? 0, error: null });
  applyVolume();
  updateMediaSession();
  persist();
  if (song) scrobble(song.id, false);
  preloadNext();
  // Lyrics for the next two songs, so the panel is ready when they start.
  for (const next of Q.peekUpcoming(state.queue, 2)) void queryClient.prefetchQuery(queries.lyrics(next.id));
}

/** Load the queue's current song; plays it when `autoplay`. A song already preloaded starts instantly. */
function load(autoplay: boolean, startAt = 0): void {
  const song = current();
  if (!song) return;
  decks.load(song.id, streamUrl(song.id), currentFactor(), startAt, false);
  set({ buffering: autoplay });
  started(autoplay ? song : undefined);
  if (!autoplay) {
    set({ duration: song.duration ?? 0 });
    updateMediaSession();
  }
  setPosition(startAt);
  if (autoplay) void decks.play().catch(() => set({ playing: false, buffering: false }));
}

/** Move the queue and start the new current song, or stop at the end. */
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
    // Ready on the next song, paused, so play continues from there.
    if (Q.peekNext(state.queue)) {
      setQueue(Q.next(state.queue));
      load(false);
    }
    return;
  }
  if (state.queue.repeat === "one") load(true);
  else advance(Q.next(state.queue));
}

/** Apply a queue edit that added songs, and say so with an undo that takes exactly those back out. */
function queued(next: Q.Queue, where: string): void {
  const before = new Set(state.queue.upNext.map((entry) => entry.uid));
  edit(next);
  const added = next.upNext.filter((entry) => !before.has(entry.uid));
  if (!added.length) return;
  notify({
    message: `added ${added.length === 1 ? (added[0] as Q.Entry).song.title : `${added.length} songs`} ${where}`,
    action: {
      label: "undo",
      onClick: () => edit(added.reduce((queue, entry) => Q.remove(queue, entry), state.queue)),
    },
  });
}

/**
 * Apply a queue edit that took songs out, with an undo: the queue as it was if the same song is still playing,
 * otherwise the removed songs back at the end of your queue.
 */
function removed(next: Q.Queue, message: string): void {
  const before = state.queue;
  const upcoming = (queue: Q.Queue) => [...queue.upNext, ...Q.contextUpcoming(queue)];
  const left = new Set(upcoming(next).map((entry) => entry.uid));
  const gone = upcoming(before).filter((entry) => !left.has(entry.uid));
  edit(next);
  if (!gone.length) return;
  notify({
    message,
    action: {
      label: "undo",
      onClick: () =>
        edit(
          state.queue.current?.uid === before.current?.uid
            ? before
            : Q.addToQueue(
                state.queue,
                gone.map((entry) => entry.song),
              ),
        ),
    },
  });
}

let sleepTimer: ReturnType<typeof setTimeout> | undefined;
const FADE_SECONDS = 10;

/** Timed sleep: fade out over the last 10 s, pause, then put the volume back for next time. */
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

/** Lets the OS scrubber (macOS Now Playing, lock screens) show and move the playhead. */
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
  /** Current state for event handlers, which should read rather than subscribe. */
  getState: (): PlayerState => state,
  getPosition: (): number => position,
  /** End of the buffered range around the playhead, in seconds. */
  getBuffered: (): number => decks.buffered(),
  element: (): HTMLAudioElement => decks.element,
  /** Sleep timer: minutes from now, "track" (stop after this song), "album", or null to cancel. */
  setSleep(option: number | "track" | "album" | null): void {
    const sleep: Sleep =
      option === null ? null : typeof option === "number" ? { kind: "time", until: Date.now() + option * 60_000 } : { kind: option };
    set({ sleep });
    armSleep();
    applyVolume();
    preloadNext();
  },
  /** ⇧S: stop when this song ends; again to cancel. */
  toggleStopAfterCurrent(): void {
    player.setSleep(state.sleep?.kind === "track" ? null : "track");
  },
  /** Try the current song again after an error, from where it stopped. */
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
  /** Start a context (album, playlist, …) at `start`, `startAt` seconds in (a lyrics hit). Your up-next queue stays. */
  play(songs: Song[], start = 0, options: { shuffle?: boolean; album?: boolean; source?: Q.QueueSource; startAt?: number } = {}): void {
    if (!songs.length) return;
    advance(Q.playContext(state.queue, songs, start, options), options.startAt);
  },
  toggle(force?: boolean): void {
    if (!current()) return;
    const element = decks.element;
    const shouldPlay = force ?? element.paused;
    if (!shouldPlay) decks.pause();
    // A restored queue has nothing loaded yet: load it where it was left.
    else if (!element.src) load(true, position);
    else void decks.play().catch(() => set({ playing: false }));
  },
  next(): void {
    if (current()) advance(Q.next(state.queue));
  },
  /** Restart the track if more than 3 s in, otherwise go back one (`force`: always go back, e.g. undoing a skip). */
  previous(force = false): void {
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
  /** To the top of your queue; starts playing if nothing is. */
  playNext(songs: Song[]): void {
    if (!current()) player.play(songs);
    else queued(Q.playNext(state.queue, songs), "to play next");
  },
  /** To the end of your queue; starts playing if nothing is. */
  addToQueue(songs: Song[]): void {
    if (!current()) player.play(songs);
    else queued(Q.addToQueue(state.queue, songs), "to the queue");
  },
  move(entry: Q.Entry, delta: -1 | 1): void {
    edit(Q.move(state.queue, entry, delta));
  },
  /** Drag and drop in the queue: `entry` takes `to`'s place. */
  moveTo(entry: Q.Entry, to: Q.Entry): void {
    edit(Q.moveTo(state.queue, entry, to));
  },
  /** Take over a queue from another device, paused at `seconds` in its current song (the queue hand-off). */
  adopt(songs: Song[], index: number, seconds: number): void {
    if (!songs.length) return;
    setQueue(Q.playContext(Q.clearUpNext(state.queue), songs, index, { source: { kind: "handoff", name: "your other device" } }));
    load(false, seconds);
  },
  /** Notified on every state change (the queue sync listens). */
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
  /** Saves what's playing and everything still to come as a new playlist. */
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

/** `useSyncExternalStore` with a selector: re-renders only when the selected value changes (by `isEqual`). */
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

/** Position as a frame source for audiocn's timeline components, which subscribe without re-rendering their parents. */
export const positionFrames: FrameSource<number> = {
  subscribe(listener) {
    const forward = () => listener(position);
    positionListeners.add(forward);
    return () => positionListeners.delete(forward);
  },
};

/** Subscribe to one slice of the player, e.g. `usePlayer((s) => s.playing)`. */
export function usePlayer<T>(selector: (state: PlayerState) => T, isEqual: (a: T, b: T) => boolean = Object.is): T {
  return useSelected(subscribe, () => state, selector, isEqual);
}

/** Playback position in seconds, updated every frame; pass a selector (e.g. `Math.floor`) to re-render less often. */
export function usePosition<T = number>(selector: (seconds: number) => T = (seconds) => seconds as T): T {
  return useSelected(subscribePosition, () => position, selector, Object.is);
}

export function currentSong(value: PlayerState): Song | undefined {
  return value.queue.current?.song;
}
