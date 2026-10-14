import { del, get, set as setStored } from "idb-keyval";
import { useRef, useSyncExternalStore } from "react";
import type { FrameSource } from "./audio/types";
import { Decks } from "./decks";
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
  error: string | null;
}

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

/** Album gain only while an album plays in order from its context; queued songs in between use track gain. */
const currentFactor = () => replayGainFactor(current(), state.queue.context.album && state.queue.current?.from === "context");

const decks = new Decks({
  playing: () => {
    set({ playing: true, buffering: false, error: null });
    startTicker();
  },
  pause: () => {
    setPosition(decks.element.currentTime);
    set({ playing: false });
    persist();
  },
  waiting: () => set({ buffering: true }),
  canPlay: () => {
    set({ buffering: false });
    preloadNext();
  },
  duration: (seconds) => set({ duration: seconds || (current()?.duration ?? 0) }),
  time: (seconds) => {
    if (document.hidden) setPosition(seconds);
    const song = current();
    const duration = decks.element.duration;
    if (song && !scrobbled && (seconds >= SCROBBLE_AFTER_SEC || (duration > 0 && seconds >= duration / 2))) {
      scrobbled = true;
      scrobble(song.id, true);
    }
  },
  seeked: (seconds) => setPosition(seconds),
  ended: onEnded,
  handover: () => {
    // The next song is already playing: move the queue to match, then line up the one after it.
    if (state.queue.repeat !== "one") setQueue(Q.next(state.queue));
    started(current());
  },
  error: () => set({ playing: false, buffering: false, error: "couldn't play this track" }),
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
  if (queue.repeat === "one") {
    const song = current();
    return song ? { song, factor: currentFactor() } : null;
  }
  const song = Q.peekNext(queue);
  if (!song) return null;
  const fromContext = queue.upNext.length === 0;
  return { song, factor: replayGainFactor(song, fromContext && queue.context.album) };
}

/** Keep the idle deck holding whatever plays next; called whenever the queue changes. */
function preloadNext(): void {
  if (!current()) return;
  const next = upcoming();
  decks.preload(next?.song.id ?? null, next ? streamUrl(next.song.id) : null, next?.factor ?? 1);
  // The player bar shows the next cover within minutes; have it cached by then.
  preloadCover(next?.song.coverArt, 42);
}

/** Bookkeeping when a song starts (loaded or handed over gaplessly). */
function started(song: Song | undefined): void {
  scrobbled = false;
  setPosition(0);
  set({ duration: song?.duration ?? 0, error: null });
  applyVolume();
  updateMediaSession();
  persist();
  if (song) scrobble(song.id, false);
  preloadNext();
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
function advance(queue: Q.Queue): void {
  setQueue(queue);
  if (queue.current) load(true);
  else {
    decks.pause();
    decks.preload(null, null, 1);
    set({ playing: false });
    setPosition(0);
  }
}

function onEnded(): void {
  if (state.queue.repeat === "one") load(true);
  else advance(Q.next(state.queue));
}

function updateMediaSession(): void {
  const song = current();
  if (!("mediaSession" in navigator) || !song) return;
  const art = coverUrl(song.coverArt, 512);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist ?? "",
    album: song.album ?? "",
    artwork: art ? [{ src: art, sizes: "512x512" }] : [],
  });
}

if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () => player.toggle(true));
  navigator.mediaSession.setActionHandler("pause", () => player.toggle(false));
  navigator.mediaSession.setActionHandler("nexttrack", () => player.next());
  navigator.mediaSession.setActionHandler("previoustrack", () => player.previous());
  navigator.mediaSession.setActionHandler("seekto", (details) => details.seekTime !== undefined && player.seek(details.seekTime));
}

export const player = {
  /** Current state for event handlers, which should read rather than subscribe. */
  getState: (): PlayerState => state,
  getPosition: (): number => position,
  /** End of the buffered range around the playhead, in seconds. */
  getBuffered: (): number => decks.buffered(),
  element: (): HTMLAudioElement => decks.element,
  setOutputDevice(id: string | null): void {
    set({ outputDevice: id });
    applyOutputDevice();
    persist();
  },
  /** Start a context (album, playlist, …) at `start`. Your up-next queue stays. */
  play(songs: Song[], start = 0, options: { shuffle?: boolean; album?: boolean; source?: Q.QueueSource } = {}): void {
    if (!songs.length) return;
    advance(Q.playContext(state.queue, songs, start, options));
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
  /** Restart the track if more than 3 s in, otherwise go back one. */
  previous(): void {
    if (position > 3 || state.queue.history.length === 0) {
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
    else edit(Q.playNext(state.queue, songs));
  },
  /** To the end of your queue; starts playing if nothing is. */
  addToQueue(songs: Song[]): void {
    if (!current()) player.play(songs);
    else edit(Q.addToQueue(state.queue, songs));
  },
  remove(entry: Q.Entry): void {
    edit(Q.remove(state.queue, entry));
  },
  clearUpNext(): void {
    edit(Q.clearUpNext(state.queue));
  },
  clearContext(): void {
    edit(Q.clearContext(state.queue));
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
