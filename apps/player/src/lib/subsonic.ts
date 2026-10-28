import { snapCoverSize } from "@lodesong/shared/cover-sizes";
import { useSyncExternalStore } from "react";
import { markUnreachable, noteResponse } from "./reachability";
import { getSetting } from "./settings";
import { FALLBACK, type StreamQuality, streamParams } from "./stream-quality";

// The browser never holds credentials: the server keeps them behind an httpOnly cookie. Only the username is
// remembered here, to render the app shell before the first request.
const USER_KEY = "keep-player:user";
const ACCOUNT_KEY = "keep-player:account";
/** Must match the server's CSRF check (apps/api/src/api.ts). */
const CLIENT_ID = (() => {
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
export const CLIENT_NAME = `lodesong@${CLIENT_ID}`;

export const HEADERS = { "x-lodesong": "1", "x-keep-client": CLIENT_ID };

class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

function readUser(): string | null {
  try {
    localStorage.removeItem("keep-player:auth");
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

let user = readUser();
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
  } catch {}
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUser(): string | null {
  return user;
}

export function useUser(): string | null {
  return useSyncExternalStore(subscribe, () => user);
}

export function useCheckingSession(): boolean {
  return useSyncExternalStore(subscribe, () => checking);
}

const accountListeners = new Set<() => unknown>();

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

async function setAccount(next: string | null): Promise<void> {
  const changed = currentAccount() !== (next ?? "");
  try {
    if (next) localStorage.setItem(ACCOUNT_KEY, next);
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch {}
  if (changed) await Promise.all([...accountListeners].map((listener) => listener()));
}

export async function login(name: string, password: string, server?: string): Promise<void> {
  const response = await fetch("/auth/login", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ user: name, password, server }),
  }).catch(() => null);
  if (!response) throw new Error("can't reach lodesong: check your connection");
  const body = (await response.json().catch(() => ({}))) as { user?: string; server?: string; error?: string };
  if (!response.ok || !body.user) throw new Error(body.error ?? "login failed");
  await setAccount(`${body.server ?? ""}/${body.user}`);
  setUser(body.user);
}

export async function logout(): Promise<void> {
  await fetch("/auth/logout", { method: "POST", headers: HEADERS }).catch(() => undefined);
  try {
    localStorage.removeItem("keep-player:state");
  } catch {}
  await setAccount(null);
  setUser(null);
  window.location.assign("/");
}

type Params = Record<string, string | number | boolean | undefined | (string | number)[]>;

function query(params: Params): string {
  const search = new URLSearchParams({ f: "json" });
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const item of value) search.append(key, String(item));
    else if (value !== undefined) search.set(key, String(value));
  }
  return search.toString();
}

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

export function coverSrcSet(id: string, cssSize: number): string {
  return `${coverUrl(id, cssSize)} 1x, ${coverUrl(id, cssSize * 2)} 2x`;
}

export function preloadCover(id: string | undefined, cssSize: number): void {
  const url = coverUrl(id, cssSize * Math.min(window.devicePixelRatio || 1, 2));
  if (url) new Image().src = url;
}

const transcoded = new Set<string>();

export function fallBackToTranscode(id: string): void {
  transcoded.add(id);
}

export function qualityOf(id: string): StreamQuality {
  return transcoded.has(id) ? FALLBACK : getSetting("streamQuality");
}

export function streamUrl(id: string): string {
  return `/rest/stream?${new URLSearchParams({ id, ...streamParams(qualityOf(id)) })}`;
}

export function scrobble(id: string, submission: boolean): void {
  void fetch(`/rest/scrobble?${query({ id, submission, time: Date.now() })}`, { headers: HEADERS }).catch(() => undefined);
}
