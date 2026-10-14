import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** A Navidrome (or any OpenSubsonic) server this instance may talk to. Only ever from config, never from a request. */
export interface Upstream {
  id: string;
  url: string;
}

/** `NAVIDROME_SERVERS="home=https://music.example.com,friend=https://..."`, else the single `NAVIDROME_URL`. */
export function parseUpstreams(servers: string | undefined, single: string | undefined): Upstream[] {
  const list = (servers ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const at = entry.indexOf("=");
      return {
        id: entry.slice(0, at).trim(),
        url: entry
          .slice(at + 1)
          .trim()
          .replace(/\/+$/, ""),
      };
    })
    .filter((upstream) => upstream.id && /^https?:\/\//.test(upstream.url));
  return list.length ? list : [{ id: "default", url: (single ?? "http://navidrome:4533").replace(/\/+$/, "") }];
}

const dataDir = process.env.DATA_DIR ?? "./data";
mkdirSync(dataDir, { recursive: true });

/** `SESSION_SECRET`, or a random one generated once and kept in the data dir (so one env var is enough to start). */
function sessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const path = join(dataDir, "session.secret");
  if (!existsSync(path)) {
    writeFileSync(path, crypto.getRandomValues(new Uint8Array(32)).toHex());
    chmodSync(path, 0o600);
  }
  return readFileSync(path, "utf8").trim();
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  dataDir,
  upstreams: parseUpstreams(process.env.NAVIDROME_SERVERS, process.env.NAVIDROME_URL),
  sessionSecret: sessionSecret(),
  sessionIdleDays: Number(process.env.SESSION_IDLE_DAYS ?? 30),
  /** Disk space for resized covers (`$DATA_DIR/covers`), least recently used deleted first. */
  coverCacheMb: Number(process.env.COVER_CACHE_MB ?? 1024),
  /** Where missing lyrics are looked up; empty turns LRCLIB off. */
  lrclibUrl: (process.env.LRCLIB_URL ?? "https://lrclib.net").replace(/\/+$/, ""),
  /** Walk the library in the background to fetch lyrics nobody opened yet ("off" to disable). */
  lyricsBackfill: (process.env.LYRICS_BACKFILL ?? "on") !== "off",
  /** Navidrome account for background jobs; without one, the most recently active admin's session is used. */
  indexUser: process.env.INDEX_USER,
  indexPassword: process.env.INDEX_PASSWORD,
  /** Behind a reverse proxy, client IPs come from X-Real-IP / X-Forwarded-For (used for login rate limits). */
  trustProxy: ["1", "true", "yes"].includes((process.env.TRUST_PROXY ?? "").toLowerCase()),
};
