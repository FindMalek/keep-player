import { useSyncExternalStore } from "react";
import { coverUrl, scrobble, streamUrl } from "./subsonic";
import type { Song } from "./types";

export type Repeat = "off" | "all" | "one";

export interface PlayerState {
  queue: Song[];
  index: number;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: Repeat;
  /** "album" when the queue is one album in order, so ReplayGain uses album gain. */
  context: "album" | "mixed";
  error: string | null;
}

const STORAGE_KEY = "keep-player:state";
const SCROBBLE_AFTER_SEC = 240;

let state: PlayerState = {
  queue: [],
  index: -1,
  playing: false,
  buffering: false,
  position: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: "off",
  context: "mixed",
  error: null,
};
/** Order before shuffling, so turning shuffle off restores it. */
let unshuffled: Song[] | null = null;
const listeners = new Set<() => void>();

let audio: HTMLAudioElement | null = null;
let gain: GainNode | null = null;
let context: AudioContext | null = null;
let scrobbled = false;

function set(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function persist(): void {
  try {
    const { queue, index, position, volume, muted, shuffle, repeat, context: ctx } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ queue, index, position, volume, muted, shuffle, repeat, context: ctx }));
  } catch {
    // Storage full or blocked: resuming after reload is a convenience only.
  }
}

function restore(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<PlayerState> | null;
    if (saved?.queue?.length) state = { ...state, ...saved, playing: false, buffering: false };
  } catch {
    // Ignore a corrupt or missing snapshot.
  }
}
restore();

function current(): Song | undefined {
  return state.queue[state.index];
}

/** dB → linear, clipped so the track's peak never exceeds full scale. */
function replayGainFactor(song: Song | undefined): number {
  const rg = song?.replayGain;
  if (!rg) return 1;
  const db = state.context === "album" ? (rg.albumGain ?? rg.trackGain) : (rg.trackGain ?? rg.albumGain);
  const peak = state.context === "album" ? (rg.albumPeak ?? rg.trackPeak) : (rg.trackPeak ?? rg.albumPeak);
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
    set({ position: audio.currentTime });
    const song = current();
    if (song && !scrobbled && (audio.currentTime >= SCROBBLE_AFTER_SEC || (audio.duration > 0 && audio.currentTime >= audio.duration / 2))) {
      scrobbled = true;
      scrobble(song.id, true);
    }
  });
  audio.addEventListener("durationchange", () => set({ duration: audio && Number.isFinite(audio.duration) ? audio.duration : 0 }));
  audio.addEventListener("playing", () => set({ playing: true, buffering: false, error: null }));
  audio.addEventListener("pause", () => {
    set({ playing: false });
    persist();
  });
  audio.addEventListener("waiting", () => set({ buffering: true }));
  audio.addEventListener("canplay", () => set({ buffering: false }));
  audio.addEventListener("ended", onEnded);
  audio.addEventListener("error", () => set({ playing: false, buffering: false, error: "couldn't play this track" }));
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
  } catch {
    context = null;
    gain = null;
  }
}

function load(index: number, autoplay: boolean, startAt = 0): void {
  const song = state.queue[index];
  if (!song) return;
  const element = ensureAudio();
  scrobbled = false;
  set({ index, position: startAt, duration: song.duration ?? 0, error: null, buffering: autoplay });
  element.src = streamUrl(song.id);
  // Seeking before metadata is loaded is ignored by some browsers.
  if (startAt) element.addEventListener("loadedmetadata", () => (element.currentTime = startAt), { once: true });
  applyVolume();
  updateMediaSession();
  persist();
  if (autoplay) {
    ensureGraph();
    void context?.resume();
    applyVolume();
    void element.play().catch(() => set({ playing: false, buffering: false }));
    scrobble(song.id, false);
  }
}

function onEnded(): void {
  if (state.repeat === "one") return load(state.index, true);
  if (state.index < state.queue.length - 1) return load(state.index + 1, true);
  if (state.repeat === "all" && state.queue.length) return load(0, true);
  set({ playing: false, position: 0 });
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
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
  /** Replace the queue and start playing at `start`. */
  play(songs: Song[], start = 0, options: { shuffle?: boolean; album?: boolean } = {}): void {
    if (!songs.length) return;
    let queue = songs;
    let index = start;
    unshuffled = null;
    if (options.shuffle ?? state.shuffle) {
      unshuffled = songs;
      const first = songs[start];
      queue = first ? [first, ...shuffled(songs.filter((_, i) => i !== start))] : shuffled(songs);
      index = 0;
    }
    set({ queue, shuffle: options.shuffle ?? state.shuffle, context: options.album && !(options.shuffle ?? state.shuffle) ? "album" : "mixed" });
    load(index, true);
  },
  toggle(force?: boolean): void {
    if (!current()) return;
    const element = ensureAudio();
    const shouldPlay = force ?? element.paused;
    if (shouldPlay) {
      if (!element.src) return load(state.index, true, state.position);
      ensureGraph();
      void context?.resume();
      void element.play().catch(() => set({ playing: false }));
    } else {
      element.pause();
    }
  },
  next(): void {
    if (state.index < state.queue.length - 1) load(state.index + 1, true);
    else if (state.repeat === "all" && state.queue.length) load(0, true);
  },
  /** Restart the track if more than 3 s in, otherwise go back one. */
  previous(): void {
    if (state.position > 3 || state.index === 0) return player.seek(0);
    load(state.index - 1, true);
  },
  jumpTo(index: number): void {
    load(index, true);
  },
  seek(seconds: number): void {
    if (!audio || !current()) return;
    audio.currentTime = Math.max(0, Math.min(seconds, state.duration || seconds));
    set({ position: audio.currentTime });
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
    const playingSong = current();
    if (!state.shuffle) {
      unshuffled = state.queue;
      const rest = state.queue.filter((_, i) => i !== state.index);
      set({ shuffle: true, context: "mixed", queue: playingSong ? [playingSong, ...shuffled(rest)] : shuffled(rest), index: 0 });
    } else {
      const original = unshuffled ?? state.queue;
      set({ shuffle: false, queue: original, index: Math.max(0, original.findIndex((song) => song.id === playingSong?.id)) });
      unshuffled = null;
    }
    applyVolume();
    persist();
  },
  cycleRepeat(): void {
    set({ repeat: state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off" });
    persist();
  },
  playNext(songs: Song[]): void {
    if (!current()) return player.play(songs);
    const queue = [...state.queue];
    queue.splice(state.index + 1, 0, ...songs);
    set({ queue, context: "mixed" });
    persist();
  },
  addToQueue(songs: Song[]): void {
    if (!current()) return player.play(songs);
    set({ queue: [...state.queue, ...songs], context: "mixed" });
    persist();
  },
  remove(index: number): void {
    if (index === state.index) return;
    const queue = state.queue.filter((_, i) => i !== index);
    set({ queue, index: index < state.index ? state.index - 1 : state.index });
    persist();
  },
  clear(): void {
    audio?.pause();
    if (audio) audio.removeAttribute("src");
    unshuffled = null;
    set({ queue: [], index: -1, playing: false, position: 0, duration: 0 });
    persist();
  },
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlayer(): PlayerState {
  return useSyncExternalStore(subscribe, () => state);
}

export function currentSong(value: PlayerState): Song | undefined {
  return value.queue[value.index];
}
