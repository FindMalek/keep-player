import { useSyncExternalStore } from "react";

export type Theme = "system" | "dark" | "light";

// Same key as the inline script in index.html, which applies the theme before first paint.
const STORAGE_KEY = "keep-player:theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "light" ? value : "system";
  } catch {
    return "system";
  }
}

let theme = read();

function apply(): void {
  const dark = theme === "dark" || (theme === "system" && matchMedia(DARK_QUERY).matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("light", !dark);
}

matchMedia(DARK_QUERY).addEventListener("change", () => theme === "system" && apply());

export function setTheme(next: Theme): void {
  theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private windows can refuse storage; the choice still applies until reload.
  }
  apply();
  for (const listener of listeners) listener();
}

export const getTheme = (): Theme => theme;

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => theme,
  );
}
