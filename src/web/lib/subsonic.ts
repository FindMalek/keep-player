import type { Credentials } from "./types";

const STORAGE_KEY = "keep-player:auth";
const VERSION = "1.16.1";
const CLIENT = "keep-player";

export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

export function loadCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
}

function saveCredentials(credentials: Credentials | null): void {
  try {
    if (credentials) localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private windows can refuse storage; the session still works until reload.
  }
}

let credentials = loadCredentials();

export async function login(user: string, password: string): Promise<Credentials> {
  const response = await fetch("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user, password }),
  });
  if (!response.ok) throw new Error(response.status === 401 ? "wrong username or password" : "server unreachable");
  credentials = (await response.json()) as Credentials;
  saveCredentials(credentials);
  return credentials;
}

export function logout(): void {
  credentials = null;
  saveCredentials(null);
  window.location.assign("/");
}

export function currentUser(): string | null {
  return credentials?.user ?? null;
}

function query(extra: Record<string, string | number | boolean | undefined> = {}): string {
  const params = new URLSearchParams({ u: credentials?.user ?? "", t: credentials?.token ?? "", s: credentials?.salt ?? "", v: VERSION, c: CLIENT, f: "json" });
  for (const [key, value] of Object.entries(extra)) if (value !== undefined) params.set(key, String(value));
  return params.toString();
}

/** One Subsonic call; throws ApiError, and logs out when the stored token stops working. */
export async function api<T>(endpoint: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const response = await fetch(`/rest/${endpoint}?${query(params)}`);
  if (!response.ok) throw new ApiError(response.status, `${endpoint}: ${response.status}`);
  const body = (await response.json())["subsonic-response"] as T & { status: string; error?: { code: number; message: string } };
  if (body.status !== "ok") {
    if (body.error?.code === 40 || body.error?.code === 41) logout();
    throw new ApiError(body.error?.code ?? 0, body.error?.message ?? endpoint);
  }
  return body;
}

export function coverUrl(id: string | undefined, size = 300): string | null {
  return id ? `/rest/getCoverArt?${query({ id, size })}` : null;
}

export function streamUrl(id: string): string {
  return `/rest/stream?${query({ id, format: "raw" })}`;
}

export function scrobble(id: string, submission: boolean): void {
  void fetch(`/rest/scrobble?${query({ id, submission, time: Date.now() })}`).catch(() => undefined);
}
