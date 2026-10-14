import { join } from "node:path";
import { createApi } from "./server/api";
import { LyricsBackfill, serviceAccount } from "./server/backfill";
import { config } from "./server/config";
import { CoverCache } from "./server/covers";
import { openLibraryDb } from "./server/db";
import { font } from "./server/fonts";
import { LyricsService } from "./server/lyrics";
import { LoginLimiter } from "./server/rate-limit";
import { SessionStore } from "./server/sessions";

// Dead-code eliminated per build: the executable only contains the static server, dev only the bundler route.
const { webRoutes } = process.env.NODE_ENV === "production" ? await import("./server/static") : await import("./server/dev");

const idleSeconds = config.sessionIdleDays * 86_400;
const sessions = new SessionStore(join(config.dataDir, "sessions.db"), config.sessionSecret, idleSeconds * 1000);
setInterval(() => sessions.purgeIdle(), 3_600_000).unref();

const library = openLibraryDb(join(config.dataDir, "library.db"));
const lyrics = new LyricsService(library, config.lrclibUrl);
const covers = new CoverCache(join(config.dataDir, "covers"), config.coverCacheMb * 1024 * 1024);
const api = createApi({
  upstreams: config.upstreams,
  covers,
  lyrics,
  sessions,
  limiter: new LoginLimiter(),
  idleSeconds,
  trustProxy: config.trustProxy,
});

if (config.lyricsBackfill && config.lrclibUrl)
  for (const upstream of config.upstreams)
    new LyricsBackfill(
      library,
      lyrics,
      upstream,
      serviceAccount(sessions, upstream, { user: config.indexUser, password: config.indexPassword }),
    ).start();

const server = Bun.serve({
  port: config.port,
  development: process.env.NODE_ENV !== "production",
  // Long streams must not be cut by the idle timeout.
  idleTimeout: 0,
  routes: {
    "/healthz": () => new Response("ok"),
    "/auth/login": { POST: (request, srv) => api.login(request, srv) },
    "/auth/logout": { POST: api.logout },
    "/auth/session": { GET: api.current },
    "/auth/sessions": { GET: api.listSessions },
    "/auth/sessions/:id": { DELETE: api.revokeSession },
    "/rest/*": api.proxy,
    "/cover/:id/:size": api.cover,
    "/api/lyrics/:songId": { GET: api.songLyrics },
    "/fonts/:name": font,
    ...webRoutes,
  },
});

console.log(`keep-player on :${server.port} → ${config.upstreams.map((upstream) => `${upstream.id} ${upstream.url}`).join(", ")}`);
