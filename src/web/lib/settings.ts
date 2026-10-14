import { useSyncExternalStore } from "react";

/*
 * Per-browser preferences in localStorage. Small on purpose: the settings page (#53) shows these and more.
 */

export interface Settings {
  /** 1–5 star ratings (setRating) as a column in track lists, for smart playlists in other clients. */
  ratings: boolean;
}

const KEY = "keep-player:settings";
const DEFAULTS: Settings = { ratings: false };

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

export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => settings[key],
  );
}
