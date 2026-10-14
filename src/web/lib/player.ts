import { del, get, set as setStored } from "idb-keyval";
import { useRef, useSyncExternalStore } from "react";
import type { FrameSource } from "./audio/types";
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

let audio: HTMLAudioElement | null = null;
let gain: GainNode | null = null;
let context: AudioContext | null = null;
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
  if (!audio || audio.paused || document.hidden) return;
  setPosition(audio.currentTime);
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

/** dB → linear, clipped so the track's peak never exceeds full scale. */
function replayGainFactor(song: Song | undefined): number {
  const rg = song?.replayGain;
  if (!rg) return 1;
  // Album gain only while an album plays in order from its context; anything else is track gain.
  const album = state.queue.context.album && state.queue.current?.from === "context";
  const db = album ? (rg.albumGain ?? rg.trackGain) : (rg.trackGain ?? rg.albumGain);
  const peak = album ? (rg.albumPeak ?? rg.trackPeak) : (rg.trackPeak ?? rg.albumPeak);
  if (db === undefined) return 1;
  const factor = 10 ** (db / 20);
  return peak ? Math.min(factor, 1 / peak) : factor;
}

function applyVolume(): void {
  if (!audio) return;
  audio.volume = state.muted ? 0 : state.volume;
  if (gain) gain.gain.value = replayGainFactor(current());
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.addEventListener("timeupdate", () => {
    if (!audio) return;
    if (document.hidden) setPosition(audio.currentTime);
    const song = current();
    if (
      song &&
      !scrobbled &&
      (audio.currentTime >= SCROBBLE_AFTER_SEC || (audio.duration > 0 && audio.currentTime >= audio.duration / 2))
    ) {
      scrobbled = true;
      scrobble(song.id, true);
    }
  });
  audio.addEventListener("durationchange", () => set({ duration: audio && Number.isFinite(audio.duration) ? audio.duration : 0 }));
  audio.addEventListener("playing", () => {
    set({ playing: true, buffering: false, error: null });
    startTicker();
  });
  audio.addEventListener("seeked", () => audio && setPosition(audio.currentTime));
  audio.addEventListener("pause", () => {
    if (audio) setPosition(audio.currentTime);
    set({ playing: false });
    persist();
  });
  audio.addEventListener("waiting", () => set({ buffering: true }));
  audio.addEventListener("canplay", () => set({ buffering: false }));
  audio.addEventListener("ended", onEnded);
  audio.addEventListener("error", () => set({ playing: false, buffering: false, error: "couldn't play this track" }));
  applyOutputDevice();
  return audio;
}

/** Web Audio is created on the first user gesture (browsers block it before that). */
function ensureGraph(): void {
  if (context || !audio) return;
  try {
    context = new AudioContext();
    const source = context.createMediaElementSource(audio);
    gain = context.createGain();
    source.connect(gain).connect(context.destination);
    applyOutputDevice();
  } catch {
    context = null;
    gain = null;
  }
}

/** Audio goes through Web Audio once the graph exists, so the device is set on the context, not the element. */
function applyOutputDevice(): void {
  const id = state.outputDevice ?? "";
  const target = (context ?? audio) as { setSinkId?: (id: string) => Promise<void> } | null;
  void target?.setSinkId?.(id).catch(() => set({ outputDevice: null }));
}

/** Load the queue's current song into the element; plays it when `autoplay`. */
function load(autoplay: boolean, startAt = 0): void {
  const song = current();
  if (!song) return;
  const element = ensureAudio();
  scrobbled = false;
  set({ duration: song.duration ?? 0, error: null, buffering: autoplay });
  setPosition(startAt);
  element.src = streamUrl(song.id);
  // Seeking before metadata is loaded is ignored by some browsers.
  if (startAt) element.addEventListener("loadedmetadata", () => (element.currentTime = startAt), { once: true });
  applyVolume();
  updateMediaSession();
  // The player bar shows the next cover within minutes; have it cached by then.
  preloadCover(Q.peekNext(state.queue)?.coverArt, 42);
  persist();
  if (autoplay) {
    ensureGraph();
    void context?.resume();
    applyVolume();
    void element.play().catch(() => set({ playing: false, buffering: false }));
    scrobble(song.id, false);
  }
}

/** Move the queue and start the new current song, or stop at the end. */
function advance(queue: Q.Queue): void {
  setQueue(queue);
  if (queue.current) load(true);
  else {
    audio?.pause();
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
  getBuffered(): number {
    if (!audio) return 0;
    for (let i = 0; i < audio.buffered.length; i += 1)
      if (audio.buffered.start(i) <= audio.currentTime + 0.5) {
        const end = audio.buffered.end(i);
        if (end >= audio.currentTime) return end;
      }
    return 0;
  },
  element: (): HTMLAudioElement | null => audio,
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
    const element = ensureAudio();
    const shouldPlay = force ?? element.paused;
    if (shouldPlay) {
      if (!element.src) {
        load(true, position);
        return;
      }
      ensureGraph();
      void context?.resume();
      void element.play().catch(() => set({ playing: false }));
    } else {
      element.pause();
    }
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
    if (!audio || !current()) return;
    audio.currentTime = Math.max(0, Math.min(seconds, state.duration || seconds));
    setPosition(audio.currentTime);
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
    setQueue(Q.setShuffle(state.queue, !state.queue.shuffle));
    applyVolume();
  },
  setRepeat(repeat: Q.Repeat): void {
    setQueue({ ...state.queue, repeat });
  },
  cycleRepeat(): void {
    const { repeat } = state.queue;
    player.setRepeat(repeat === "off" ? "all" : repeat === "all" ? "one" : "off");
  },
  /** To the top of your queue; starts playing if nothing is. */
  playNext(songs: Song[]): void {
    if (!current()) player.play(songs);
    else setQueue(Q.playNext(state.queue, songs));
  },
  /** To the end of your queue; starts playing if nothing is. */
  addToQueue(songs: Song[]): void {
    if (!current()) player.play(songs);
    else setQueue(Q.addToQueue(state.queue, songs));
  },
  remove(entry: Q.Entry): void {
    setQueue(Q.remove(state.queue, entry));
  },
  clearUpNext(): void {
    setQueue(Q.clearUpNext(state.queue));
  },
  clearContext(): void {
    setQueue(Q.clearContext(state.queue));
  },
  /** Saves what's playing and everything still to come as a new playlist. */
  async saveAsPlaylist(name: string): Promise<void> {
    const { current: playing, upNext } = state.queue;
    const songs = [...(playing ? [playing] : []), ...upNext, ...Q.contextUpcoming(state.queue)].map((entry) => entry.song.id);
    await api("createPlaylist", { name, songId: songs });
  },
  clear(): void {
    audio?.pause();
    if (audio) audio.removeAttribute("src");
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
