import { join } from "node:path";
import { createApi } from "./server/api";
import { LyricsBackfill, serviceAccount } from "./server/backfill";
import { config } from "./server/config";
import { CoverCache } from "./server/covers";
import { openLibraryDb } from "./server/db";
import { font } from "./server/fonts";
import { HealthCheck, UpdateCheck, VERSION } from "./server/health";
import { LyricsService } from "./server/lyrics";
import { LoginLimiter } from "./server/rate-limit";
import { IndexSync } from "./server/search-index";
import { SessionStore } from "./server/sessions";

// Dead-code eliminated per build: the executable only contains the static server, dev only the bundler route.
const { webRoutes } = process.env.NODE_ENV === "production" ? await import("./server/static") : await import("./server/dev");

const idleSeconds = config.sessionIdleDays * 86_400;
const sessions = new SessionStore(join(config.dataDir, "sessions.db"), config.sessionSecret, idleSeconds * 1000);
setInterval(() => sessions.purgeIdle(), 3_600_000).unref();

const library = openLibraryDb(join(config.dataDir, "library.db"));
const lyrics = new LyricsService(library, config.lrclibUrl);
const indexes = new Map(
  config.upstreams.map((upstream) => [
    upstream.id,
    new IndexSync(library, upstream, serviceAccount(sessions, upstream, { user: config.indexUser, password: config.indexPassword })),
  ]),
);
for (const index of indexes.values()) index.start();
const covers = new CoverCache(join(config.dataDir, "covers"), config.coverCacheMb * 1024 * 1024);
const api = createApi({
  upstreams: config.upstreams,
  covers,
  lyrics,
  indexes,
  library,
  sessions,
  limiter: new LoginLimiter(),
  idleSeconds,
  trustProxy: config.trustProxy,
  updates: new UpdateCheck(config.updateCheck),
});
const health = new HealthCheck(config.upstreams);

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
    // Liveness (the container's healthcheck): the process answers. Readiness, with Navidrome: /api/health.
    "/healthz": () => new Response("ok"),
    "/api/health": { GET: () => health.response() },
    "/api/version": { GET: api.version },
    "/auth/login": { POST: (request, srv) => api.login(request, srv) },
    "/auth/logout": { POST: api.logout },
    "/auth/session": { GET: api.current },
    "/auth/sessions": { GET: api.listSessions },
    "/auth/sessions/:id": { DELETE: api.revokeSession },
    "/rest/*": api.proxy,
    "/cover/:id/:size": api.cover,
    "/api/lyrics/:songId": { GET: api.songLyrics },
    "/api/lyrics/:songId/offset": { GET: api.lyricsOffset, PUT: api.lyricsOffset },
    "/api/playlists/:id/hidden": { GET: api.playlistHidden, PUT: api.playlistHidden },
    "/api/history": { GET: api.history, POST: api.history },
    "/api/stats": { GET: api.stats },
    "/api/stats/forgotten": { GET: api.forgotten },
    "/api/index": { GET: api.searchIndex, POST: api.searchIndex },
    "/api/search": { GET: api.searchLibrary },
    "/api/search/lyrics": { GET: api.searchLyrics },
    "/fonts/:name": font,
    ...webRoutes,
  },
});

console.log(
  `keep-player ${VERSION} on :${server.port} → ${config.upstreams.map((upstream) => `${upstream.id} ${upstream.url}`).join(", ")}`,
);
