import { useSyncExternalStore } from "react";
import type { Message, Status } from "../sw";
import { onAccountChange } from "./subsonic";

let status: Status = { type: "status", ids: [], bytes: 0, cap: 0, pinned: {} };
let cached = new Set<string>();
const listeners = new Set<() => void>();

/** Through the registration, not `controller`: on a first visit the worker isn't controlling the page yet. */
function post(message: Message): void {
  void navigator.serviceWorker?.ready.then((registration) => registration.active?.postMessage(message));
}

// Registered once the page is idle: installing downloads the whole app shell, which must not compete with first paint.
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

export function isCached(id: string): boolean {
  return cached.has(id);
}

export function controlled(): boolean {
  return !!navigator.serviceWorker?.controller;
}

export function onCacheChange(listener: () => void): () => void {
  return subscribe(listener);
}

export function useCachedIds(): Set<string> {
  return useSyncExternalStore(subscribe, () => cached);
}

export function useOfflineStatus(): Status {
  return useSyncExternalStore(subscribe, () => status);
}

export function precache(ids: string[]): void {
  if (ids.length) post({ type: "precache", ids });
}

export function dropPrecache(id: string): void {
  post({ type: "drop", id });
}

export function pausePrecache(paused: boolean): void {
  post({ type: paused ? "pause" : "resume" });
}

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

onAccountChange(() => clearOfflineCache());
