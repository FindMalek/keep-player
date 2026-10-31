import { useSyncExternalStore } from "react";
import type { StreamQuality } from "./stream-quality";

// Prefs in SYNCED follow you to every browser through the server (settings-sync.ts); the rest belong to this device.

export const TOAST_LEVELS = ["all", "important", "errors"] as const;
export type ToastLevel = (typeof TOAST_LEVELS)[number];
export const TOAST_POSITIONS = ["bottom-center", "bottom-right", "bottom-left", "top-center", "top-right"] as const;
export type ToastPosition = (typeof TOAST_POSITIONS)[number];

export interface Settings {
  toasts: ToastLevel;
  toastPosition: ToastPosition;
  upNext: boolean;
  ratings: boolean;
  offlineInBar: boolean;
  loadingBar: boolean;
  miniPlayerWhenHidden: boolean;
  queueSync: boolean;
  followOtherDevices: boolean;
  /** Never inside an album played in order. */
  crossfade: number;
  streamQuality: StreamQuality;
  normalization: "off" | "track" | "album" | "auto";
  preamp: number;
  eqOn: boolean;
  eqGains: number[];
  look: string;
}

export const SYNCED = [
  "toasts",
  "toastPosition",
  "upNext",
  "ratings",
  "offlineInBar",
  "loadingBar",
  "queueSync",
  "followOtherDevices",
  "crossfade",
  "normalization",
  "preamp",
  "eqOn",
  "eqGains",
  "look",
] as const satisfies readonly (keyof Settings)[];

const KEY = "keep-player:settings";
const DEFAULTS: Settings = {
  toasts: "all",
  toastPosition: "bottom-center",
  upNext: true,
  ratings: false,
  offlineInBar: false,
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
  look: "",
};

const NORMALIZATIONS = ["off", "track", "album", "auto"];

export function sanitize<K extends keyof Settings>(key: K, value: unknown): Settings[K] | undefined {
  const fallback = DEFAULTS[key];
  if (typeof value !== typeof fallback) return undefined;
  if (key === "toasts") return ((TOAST_LEVELS as readonly unknown[]).includes(value) ? value : undefined) as Settings[K] | undefined;
  if (key === "normalization") return (NORMALIZATIONS.includes(value as string) ? value : undefined) as Settings[K] | undefined;
  if (key === "look") return String(value).slice(0, 64) as Settings[K];
  if (key === "crossfade") return Math.max(0, Math.min(12, Number(value) || 0)) as Settings[K];
  if (key === "preamp") return Math.max(-12, Math.min(12, Number(value) || 0)) as Settings[K];
  if (key === "eqGains")
    return Array.isArray(value)
      ? (value.slice(0, 10).map((gain) => Math.max(-12, Math.min(12, Number(gain) || 0))) as Settings[K])
      : undefined;
  return value as Settings[K];
}

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
