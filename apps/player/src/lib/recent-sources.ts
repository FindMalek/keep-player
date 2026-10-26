import { useSyncExternalStore } from "react";
import { player } from "./player";

export interface RecentSource {
  kind: string;
  name: string;
  href: string;
  /** Cover of the first song played from it. */
  coverArt?: string;
}

const KEY = "keep-player:recent-sources";
const KEEP = 8;

function read(): RecentSource[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentSource[];
  } catch {
    return [];
  }
}

let recent = read();
const listeners = new Set<() => void>();

function remember(source: RecentSource): void {
  if (recent[0]?.href === source.href) return;
  recent = [source, ...recent.filter((item) => item.href !== source.href)].slice(0, KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(recent));
  } catch {
    // No storage: the row just lives for this session.
  }
  for (const listener of listeners) listener();
}

let started = false;

export function startRecentSources(): void {
  if (started) return;
  started = true;
  player.subscribe(() => {
    const { context } = player.getState().queue;
    const source = context.source;
    if (!source?.href) return;
    remember({ kind: source.kind, name: source.name, href: source.href, coverArt: context.songs[0]?.coverArt });
  });
}

export function useRecentSources(): RecentSource[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => recent,
  );
}
