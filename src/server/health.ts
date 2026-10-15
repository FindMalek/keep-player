import pkg from "../../package.json";
import type { Upstream } from "./settings";

export const VERSION: string = pkg.version;

export interface UpstreamHealth {
  id: string;
  reachable: boolean;
  /** Time to Navidrome's answer, in ms. */
  latencyMs: number | null;
  /** "navidrome 0.64.2", when the server says. */
  server: string | null;
  openSubsonic: boolean;
}

/**
 * `/api/health`: is each configured server reachable, how fast, and what is it. Public (the sign-in screen uses it to
 * explain a broken setup), so it never shows a URL, and answers are cached for 10 s.
 */
export class HealthCheck {
  private cached: { at: number; result: Promise<UpstreamHealth[]> } | null = null;

  constructor(
    private readonly upstreams: Upstream[],
    private readonly ttlMs = 10_000,
  ) {}

  check(): Promise<UpstreamHealth[]> {
    if (!this.cached || Date.now() - this.cached.at > this.ttlMs)
      this.cached = { at: Date.now(), result: Promise.all(this.upstreams.map((upstream) => probe(upstream))) };
    return this.cached.result;
  }

  async response(): Promise<Response> {
    const upstreams = await this.check();
    const ok = upstreams.every((upstream) => upstream.reachable);
    return Response.json({ status: ok ? "ok" : "degraded", version: VERSION, upstreams }, { status: ok ? 200 : 503 });
  }
}

/** An unauthenticated ping: Navidrome answers it (with an auth error) and names itself, which is all we need. */
async function probe(upstream: Upstream): Promise<UpstreamHealth> {
  const started = performance.now();
  const response = await fetch(`${upstream.url}/rest/ping?f=json&v=1.16.1&c=keep-player`, { signal: AbortSignal.timeout(5000) }).catch(
    () => null,
  );
  const body = (await response?.json().catch(() => null)) as {
    "subsonic-response"?: { type?: string; serverVersion?: string; openSubsonic?: boolean };
  } | null;
  const answer = body?.["subsonic-response"];
  if (!answer) return { id: upstream.id, reachable: false, latencyMs: null, server: null, openSubsonic: false };
  return {
    id: upstream.id,
    reachable: true,
    latencyMs: Math.round(performance.now() - started),
    server: answer.type ? `${answer.type}${answer.serverVersion ? ` ${answer.serverVersion}` : ""}` : null,
    openSubsonic: answer.openSubsonic === true,
  };
}

/** Newer release on GitHub, checked at most once a day, only when `UPDATE_CHECK=on`. */
export class UpdateCheck {
  private latest: { at: number; version: string | null } | null = null;

  constructor(
    private readonly enabled: boolean,
    private readonly url = "https://api.github.com/repos/FindMalek/keep-player/releases/latest",
  ) {}

  async info(): Promise<{ version: string; latest: string | null; updateAvailable: boolean }> {
    if (!this.enabled) return { version: VERSION, latest: null, updateAvailable: false };
    if (!this.latest || Date.now() - this.latest.at > 86_400_000) {
      const response = await fetch(this.url, {
        headers: { accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      const tag = response?.ok ? ((await response.json().catch(() => null)) as { tag_name?: string } | null)?.tag_name : undefined;
      this.latest = { at: Date.now(), version: tag ? tag.replace(/^v/, "") : null };
    }
    const latest = this.latest.version;
    return { version: VERSION, latest, updateAvailable: !!latest && newer(latest, VERSION) };
  }
}

/** Semver-ish comparison of "1.2.3" strings: is `a` newer than `b`? */
export function newer(a: string, b: string): boolean {
  const parts = (version: string) =>
    version
      .split(/[.-]/)
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}
