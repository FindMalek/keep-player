import { useSyncExternalStore } from "react";
import type { StreamQuality } from "./stream-quality";

/*
 * Preferences in localStorage, shown on the settings page (#53). The ones in SYNCED also follow you to every browser
 * through the server (settings-sync.ts); the rest belong to this device.
 */

export interface Settings {
  /** 1–5 star ratings (setRating) as a column in track lists, for smart playlists in other clients. */
  ratings: boolean;
  /** No animations or view transitions, whatever the OS says. */
  reduceMotion: boolean;
  /** Open the mini player by itself when you leave the tab while music plays (Chromium). */
  miniPlayerWhenHidden: boolean;
  /** Save the queue to the server and offer queues from Arpeggi or other browsers. */
  queueSync: boolean;
  /** Take a newer queue from another device without asking (never while this one plays). */
  followOtherDevices: boolean;
  /** Seconds the next song starts before the playing one ends (0 = off, up to 12); never inside an album played in order. */
  crossfade: number;
  /** What to stream: the original file, or a transcode for slow or metered connections. This device only. */
  streamQuality: StreamQuality;
}

/** Follow the user to every browser; the others (the mini player) depend on this device. */
export const SYNCED = [
  "ratings",
  "reduceMotion",
  "queueSync",
  "followOtherDevices",
  "crossfade",
] as const satisfies readonly (keyof Settings)[];

const KEY = "keep-player:settings";
const DEFAULTS: Settings = {
  ratings: false,
  reduceMotion: false,
  miniPlayerWhenHidden: false,
  queueSync: true,
  followOtherDevices: false,
  crossfade: 0,
  streamQuality: "original",
};

/** Read outside React (the queue sync). */
export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return settings[key];
}

function read(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

let settings = read();
const listeners = new Set<() => void>();

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  settings = { ...settings, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Kept for this session only.
  }
  for (const listener of listeners) listener();
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => settings[key],
  );
}
