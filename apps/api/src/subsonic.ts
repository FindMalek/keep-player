import type { Upstream } from "./config";

const CLIENT = "keep-player";
const VERSION = "1.16.1";

export interface Credentials {
  user: string;
  token: string;
  salt: string;
}

export function upstreamQuery(credentials: Credentials): URLSearchParams {
  return new URLSearchParams({ u: credentials.user, t: credentials.token, s: credentials.salt, v: VERSION, c: CLIENT });
}

/** A Subsonic call made by the server itself (lyrics, backfill, index), as `credentials`. Null on any failure. */
export async function subsonic<T>(
  upstream: Upstream,
  credentials: Credentials,
  endpoint: string,
  params: Record<string, string | number> = {},
): Promise<T | null> {
  const query = upstreamQuery(credentials);
  query.set("f", "json");
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  const response = await fetch(`${upstream.url}/rest/${endpoint}?${query}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as { "subsonic-response"?: T & { status?: string } } | null;
  const result = body?.["subsonic-response"];
  return result?.status === "ok" ? result : null;
}
