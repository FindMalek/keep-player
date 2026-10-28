import { useSyncExternalStore } from "react";

// A failed or 502/503/504 call marks the server unreachable and a ping retries with backoff until it answers; the
// queue keeps playing from the offline cache meanwhile.

const BACKOFF_MS = [5000, 10_000, 30_000, 60_000];

export interface Reachability {
  unreachable: boolean;
  /** When the next automatic retry happens (ms epoch), while unreachable. */
  retryAt: number | null;
}

let state: Reachability = { unreachable: false, retryAt: null };
let attempt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: Reachability): void {
  state = next;
  for (const listener of listeners) listener();
}

function schedule(): void {
  clearTimeout(timer);
  const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] as number;
  attempt += 1;
  set({ unreachable: true, retryAt: Date.now() + wait });
  timer = setTimeout(() => void retryNow(), wait);
}

export function markUnreachable(): void {
  if (!state.unreachable) {
    attempt = 0;
    schedule();
  }
}

function markReachable(): void {
  if (!state.unreachable) return;
  clearTimeout(timer);
  attempt = 0;
  set({ unreachable: false, retryAt: null });
}

export async function retryNow(): Promise<void> {
  const response = await fetch("/rest/ping", { headers: { "x-lodesong": "1" }, cache: "no-store" }).catch(() => null);
  if (response && response.status < 500) markReachable();
  else if (state.unreachable) schedule();
  else markUnreachable();
}

export function noteResponse(response: Response): Response {
  if (response.status === 502 || response.status === 503 || response.status === 504) markUnreachable();
  else markReachable();
  return response;
}

if (typeof window !== "undefined") {
  window.addEventListener("offline", markUnreachable);
  window.addEventListener("online", () => void retryNow());
}

export function useReachability(): Reachability {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
