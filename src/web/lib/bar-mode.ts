import { useSyncExternalStore } from "react";

/*
 * How much the player bar shows, by window width. Everything that doesn't fit moves into the "more" menu rather
 * than squeezing the rest: full has every control inline, laptop folds the rarely used ones away, compact drops the
 * volume slider too, mobile is two rows with only play, next and the queue in reach.
 */
export type BarMode = "full" | "laptop" | "compact" | "mobile";

export const FULL_FROM = 1600;
export const LAPTOP_FROM = 1000;
export const COMPACT_FROM = 640;

export function barModeFor(width: number): BarMode {
  return width >= FULL_FROM ? "full" : width >= LAPTOP_FROM ? "laptop" : width >= COMPACT_FROM ? "compact" : "mobile";
}

const QUERIES = [FULL_FROM, LAPTOP_FROM, COMPACT_FROM].map((width) => `(min-width: ${width}px)`);

function current(): BarMode {
  const [full, laptop, compact] = QUERIES.map((query) => window.matchMedia(query).matches);
  return full ? "full" : laptop ? "laptop" : compact ? "compact" : "mobile";
}

function subscribe(listener: () => void): () => void {
  const lists = QUERIES.map((query) => window.matchMedia(query));
  for (const list of lists) list.addEventListener("change", listener);
  return () => {
    for (const list of lists) list.removeEventListener("change", listener);
  };
}

export function useBarMode(): BarMode {
  return useSyncExternalStore(subscribe, current, () => "full");
}
