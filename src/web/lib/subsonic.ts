import { useSyncExternalStore } from "react";
import { snapCoverSize } from "../../shared/cover-sizes";
import { markUnreachable, noteResponse } from "./reachability";

/*
 * The browser never holds credentials: the server keeps them in a session behind an httpOnly cookie and adds them to
 * every upstream call. Only the username is remembered here, to render the app shell before the first request.
 */
const USER_KEY = "keep-player:user";
/** "server/user" of the last session, so cached data from another account is never shown. */
const ACCOUNT_KEY = "keep-player:account";
/** Must match the server's CSRF check (src/server/api.ts). */
/** A stable id for this browser: its Subsonic client name is `keep-player@<id>` (see queue-sync). */
export const CLIENT_ID = (() => {
  try {
    let id = localStorage.getItem("keep-player:client");
    if (!id) {
      id = crypto.randomUUID().slice(0, 8);
      localStorage.setItem("keep-player:client", id);
    }
    return id;
  } catch {
    return "browser";
  }
})();
export const CLIENT_NAME = `keep-player@${CLIENT_ID}`;

export const HEADERS = { "x-keep-player": "1", "x-keep-client": CLIENT_ID };

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
/** No username remembered (new device, cleared storage): the cookie may still hold a session, so ask once. */
let checking = user === null;
const listeners = new Set<() => void>();

if (checking)
  void fetch("/auth/session")
    .then((response) => (response.ok ? (response.json() as Promise<{ user?: string }>) : null))
    .catch(() => null)
    .then((session) => {
      checking = false;
      setUser(session?.user ?? null);
    });

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

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in username outside React. */
export function getUser(): string | null {
  return user;
}

/** The signed-in username, or null; re-renders when the session ends (logout, expiry, revoked elsewhere). */
export function useUser(): string | null {
  return useSyncExternalStore(subscribe, () => user);
}

/** True while the first session check runs, so the app can wait instead of flashing the login form. */
export function useCheckingSession(): boolean {
  return useSyncExternalStore(subscribe, () => checking);
}

const accountListeners = new Set<() => unknown>();

/** Called when the signed-in account changes or signs out, so caches holding its data can be dropped. */
export function onAccountChange(listener: () => unknown): void {
  accountListeners.add(listener);
}

function currentAccount(): string {
  try {
    return localStorage.getItem(ACCOUNT_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Resolves once every listener is done (e.g. the on-disk cache is deleted), so logout can wait for it. */
async function setAccount(next: string | null): Promise<void> {
  const changed = currentAccount() !== (next ?? "");
  try {
    if (next) localStorage.setItem(ACCOUNT_KEY, next);
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // Without storage there is no persisted cache to protect either.
  }
  if (changed) await Promise.all([...accountListeners].map((listener) => listener()));
}

export async function login(name: string, password: string): Promise<void> {
  const response = await fetch("/auth/login", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ user: name, password }),
  }).catch(() => null);
  if (!response) throw new Error("server unreachable");
  const body = (await response.json().catch(() => ({}))) as { user?: string; server?: string; error?: string };
  if (!response.ok || !body.user) throw new Error(body.error ?? "login failed");
  await setAccount(`${body.server ?? ""}/${body.user}`);
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
  await setAccount(null);
  setUser(null);
  window.location.assign("/");
}

type Params = Record<string, string | number | boolean | undefined | (string | number)[]>;

/** Arrays become repeated keys (`songId=1&songId=2`), as Subsonic expects. */
function query(params: Params): string {
  const search = new URLSearchParams({ f: "json" });
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const item of value) search.append(key, String(item));
    else if (value !== undefined) search.set(key, String(value));
  }
  return search.toString();
}

/** One Subsonic call through the server's session proxy; throws ApiError, and signs out when the session is gone. */
export async function api<T>(endpoint: string, params: Params = {}): Promise<T> {
  const response = noteResponse(
    await fetch(`/rest/${endpoint}?${query(params)}`, { headers: HEADERS }).catch((error: unknown) => {
      markUnreachable();
      throw error;
    }),
  );
  if (response.status === 401) {
    setUser(null);
    throw new ApiError(401, "signed out");
  }
  if (!response.ok) throw new ApiError(response.status, `${endpoint}: ${response.status}`);
  const body = (await response.json())["subsonic-response"] as T & { status: string; error?: { code: number; message: string } };
  if (body.status !== "ok") throw new ApiError(body.error?.code ?? 0, body.error?.message ?? endpoint);
  return body;
}

/** Credential-free and size-snapped, so the browser caches each cover forever (`immutable`). `size` is in pixels. */
export function coverUrl(id: string | undefined, size = 256): string | null {
  return id ? `/cover/${encodeURIComponent(id)}/${snapCoverSize(size)}` : null;
}

/** 1x and 2x sources for a cover drawn at `cssSize` CSS pixels. */
export function coverSrcSet(id: string, cssSize: number): string {
  return `${coverUrl(id, cssSize)} 1x, ${coverUrl(id, cssSize * 2)} 2x`;
}

/** Fetch a cover ahead of time (next tracks, hovered albums) so it's in the browser cache when it's drawn. */
export function preloadCover(id: string | undefined, cssSize: number): void {
  const url = coverUrl(id, cssSize * Math.min(window.devicePixelRatio || 1, 2));
  if (url) new Image().src = url;
}

export function streamUrl(id: string): string {
  return `/rest/stream?${new URLSearchParams({ id, format: "raw" })}`;
}

export function scrobble(id: string, submission: boolean): void {
  void fetch(`/rest/scrobble?${query({ id, submission, time: Date.now() })}`, { headers: HEADERS }).catch(() => undefined);
}
