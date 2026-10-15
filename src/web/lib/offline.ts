import { useSyncExternalStore } from "react";
import type { Message, Status } from "../sw";
import { onAccountChange } from "./subsonic";

/*
 * The page side of the service worker (src/web/sw.ts): registration, what's cached, and the messages that drive the
 * audio precache and "keep offline".
 */
let status: Status = { type: "status", ids: [], bytes: 0, cap: 0, pinned: {} };
let cached = new Set<string>();
const listeners = new Set<() => void>();

/** Through the registration, not `controller`: on a first visit the worker isn't controlling the page yet. */
function post(message: Message): void {
  void navigator.serviceWorker?.ready.then((registration) => registration.active?.postMessage(message));
}

/**
 * Registered once the page has loaded and the browser is idle: installing downloads the whole app shell, which must
 * not compete with the first paint.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  const idle = (run: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(run, { timeout: 5000 }) : setTimeout(run, 2000));
  if (document.readyState === "complete") idle(register);
  else window.addEventListener("load", () => idle(register), { once: true });
}

function register(): void {
  navigator.serviceWorker.addEventListener("message", (event: MessageEvent<Status>) => {
    if (event.data?.type !== "status") return;
    status = event.data;
    cached = new Set(status.ids);
    for (const listener of listeners) listener();
  });
  void navigator.serviceWorker.register("/sw.js").then(() => post({ type: "status" }));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Whether a song is in the audio cache, so streaming it costs no network. */
export function isCached(id: string): boolean {
  return cached.has(id);
}

/** Whether a service worker serves this page's requests (it doesn't on a first visit or with workers blocked). */
export function controlled(): boolean {
  return !!navigator.serviceWorker?.controller;
}

/** Runs `listener` whenever what's cached changes. */
export function onCacheChange(listener: () => void): () => void {
  return subscribe(listener);
}

/** Song ids saved for offline (precached or kept). */
export function useCachedIds(): Set<string> {
  return useSyncExternalStore(subscribe, () => cached);
}

export function useOfflineStatus(): Status {
  return useSyncExternalStore(subscribe, () => status);
}

/** Download these songs next (the engine sends the next few whenever the queue moves). */
export function precache(ids: string[]): void {
  if (ids.length) post({ type: "precache", ids });
}

/** Downloads wait while the playing song is still buffering, so they never compete with it. */
export function pausePrecache(paused: boolean): void {
  post({ type: paused ? "pause" : "resume" });
}

/** Keep an album or playlist offline: downloaded now and never evicted. */
export function keepOffline(group: string, ids: string[] | null): void {
  if (ids) {
    // Ask the browser not to clear our storage under pressure; harmless if it says no.
    void navigator.storage?.persist?.();
    post({ type: "pin", group, ids });
  } else post({ type: "unpin", group });
}

export function setCacheCap(bytes: number): void {
  post({ type: "cap", bytes });
}

export function clearOfflineCache(): void {
  post({ type: "clear" });
}

// Another account (or logout) must not find this one's music in the cache.
onAccountChange(() => clearOfflineCache());
