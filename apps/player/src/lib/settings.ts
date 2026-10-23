import { useSyncExternalStore } from "react";
import type { StreamQuality } from "./stream-quality";

/*
 * Preferences in localStorage, shown on the settings page (#53). The ones in SYNCED also follow you to every browser
 * through the server (settings-sync.ts); the rest belong to this device.
 */

/** Which toasts show: all of them, the ones with something to press (undo, resume), or only the errors. */
export const TOAST_LEVELS = ["all", "important", "errors"] as const;
export type ToastLevel = (typeof TOAST_LEVELS)[number];

export interface Settings {
  /** Which notices pop up at the bottom: errors always do. */
  toasts: ToastLevel;
  /** 1–5 star ratings (setRating) as a column in track lists, for smart playlists in other clients. */
  ratings: boolean;
  /** No animations or view transitions, whatever the OS says. */
  reduceMotion: boolean;
  /** The thin line at the top while lists refresh; off by default, the skeletons already say it. */
  loadingBar: boolean;
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
  /** Which ReplayGain to apply: none, the song's, the album's, or the album's while an album plays in order (auto). */
  normalization: "off" | "track" | "album" | "auto";
  /** Extra gain on top of the normalization, in dB (-12 to +12). */
  preamp: number;
  /** The ten-band equalizer, off by default; its gains in dB per band (lib/eq.ts). */
  eqOn: boolean;
  eqGains: number[];
}

/** Follow the user to every browser; the others (the mini player) depend on this device. */
export const SYNCED = [
  "toasts",
  "ratings",
  "reduceMotion",
  "loadingBar",
  "queueSync",
  "followOtherDevices",
  "crossfade",
  "normalization",
  "preamp",
  "eqOn",
  "eqGains",
] as const satisfies readonly (keyof Settings)[];

const KEY = "keep-player:settings";
const DEFAULTS: Settings = {
  toasts: "all",
  ratings: false,
  reduceMotion: false,
  loadingBar: false,
  miniPlayerWhenHidden: false,
  queueSync: true,
  followOtherDevices: false,
  crossfade: 0,
  streamQuality: "original",
  normalization: "auto",
  preamp: 0,
  eqOn: false,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

const NORMALIZATIONS = ["off", "track", "album", "auto"];

/** A value from another browser, made safe: the right type and range, or undefined to ignore it. */
export function sanitize<K extends keyof Settings>(key: K, value: unknown): Settings[K] | undefined {
  const fallback = DEFAULTS[key];
  if (typeof value !== typeof fallback) return undefined;
  if (key === "toasts") return ((TOAST_LEVELS as readonly unknown[]).includes(value) ? value : undefined) as Settings[K] | undefined;
  if (key === "normalization") return (NORMALIZATIONS.includes(value as string) ? value : undefined) as Settings[K] | undefined;
  if (key === "crossfade") return Math.max(0, Math.min(12, Number(value) || 0)) as Settings[K];
  if (key === "preamp") return Math.max(-12, Math.min(12, Number(value) || 0)) as Settings[K];
  if (key === "eqGains")
    return Array.isArray(value)
      ? (value.slice(0, 10).map((gain) => Math.max(-12, Math.min(12, Number(gain) || 0))) as Settings[K])
      : undefined;
  return value as Settings[K];
}

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
