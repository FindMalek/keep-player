import { useSyncExternalStore } from "react";

/*
 * The browser never holds credentials: the server keeps them in a session behind an httpOnly cookie and adds them to
 * every upstream call. Only the username is remembered here, to render the app shell before the first request.
 */
const USER_KEY = "keep-player:user";
/** Must match the server's CSRF check (src/server/api.ts). */
const HEADERS = { "x-keep-player": "1" };

export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

function readUser(): string | null {
  try {
    // Older versions kept the Subsonic token here; drop it.
    localStorage.removeItem("keep-player:auth");
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

let user = readUser();
const listeners = new Set<() => void>();

function setUser(next: string | null): void {
  user = next;
  try {
    if (next) localStorage.setItem(USER_KEY, next);
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Private windows can refuse storage; the session cookie still works.
  }
  for (const listener of listeners) listener();
}

/** The signed-in username, or null; re-renders when the session ends (logout, expiry, revoked elsewhere). */
export function useUser(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => user,
  );
}

export async function login(name: string, password: string): Promise<void> {
  const response = await fetch("/auth/login", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ user: name, password }),
  }).catch(() => null);
  if (!response) throw new Error("server unreachable");
  const body = (await response.json().catch(() => ({}))) as { user?: string; error?: string };
  if (!response.ok || !body.user) throw new Error(body.error ?? "login failed");
  setUser(body.user);
}

export async function logout(): Promise<void> {
  await fetch("/auth/logout", { method: "POST", headers: HEADERS }).catch(() => undefined);
  try {
    // The queue and position belong to this account.
    localStorage.removeItem("keep-player:state");
  } catch {
    // Nothing to clear.
  }
  setUser(null);
  window.location.assign("/");
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams({ f: "json" });
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  return search.toString();
}

/** One Subsonic call through the server's session proxy; throws ApiError, and signs out when the session is gone. */
export async function api<T>(endpoint: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const response = await fetch(`/rest/${endpoint}?${query(params)}`, { headers: HEADERS });
  if (response.status === 401) {
    setUser(null);
    throw new ApiError(401, "signed out");
  }
  if (!response.ok) throw new ApiError(response.status, `${endpoint}: ${response.status}`);
  const body = (await response.json())["subsonic-response"] as T & { status: string; error?: { code: number; message: string } };
  if (body.status !== "ok") throw new ApiError(body.error?.code ?? 0, body.error?.message ?? endpoint);
  return body;
}

/** Credential-free, so the browser (and later the service worker) can cache covers and audio by URL. */
export function coverUrl(id: string | undefined, size = 300): string | null {
  return id ? `/rest/getCoverArt?${new URLSearchParams({ id, size: String(size) })}` : null;
}

export function streamUrl(id: string): string {
  return `/rest/stream?${new URLSearchParams({ id, format: "raw" })}`;
}

export function scrobble(id: string, submission: boolean): void {
  void fetch(`/rest/scrobble?${query({ id, submission, time: Date.now() })}`, { headers: HEADERS }).catch(() => undefined);
}
