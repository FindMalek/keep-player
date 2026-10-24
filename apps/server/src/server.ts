import { join } from "node:path";
import { createApi } from "./api";
import { LyricsBackfill, serviceAccount } from "./backfill";
import { config } from "./config";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { font } from "./fonts";
import { HealthCheck, UpdateCheck, VERSION } from "./health";
import { LrcWriter } from "./lrc-writer";
import { LyricsService } from "./lyrics";
import { pwaRoutes } from "./pwa";
import { LoginLimiter } from "./rate-limit";
import { IndexSync } from "./search-index";
import { SessionStore } from "./sessions";
import { MAX_UPLOAD_BYTES } from "./upload";

// Dead-code eliminated per build: the executable only contains the static server, dev only the bundler route.
const { webRoutes } = process.env.NODE_ENV === "production" ? await import("./static") : await import("./dev");

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
if (config.demoSeed && config.indexUser && config.indexPassword) {
  const [first] = config.upstreams;
  const { indexUser, indexPassword } = config;
  if (first) void import("./demo-seed").then((demo) => demo.seedDemoHistory(library, first, indexUser, indexPassword));
}
const lrc = config.lrcDir ? new LrcWriter(library, config.lrcDir) : null;
if (lrc) lyrics.onLrclib = (server, song, text) => lrc.write(server, song, text);
const backfills = new Map(
  config.lyricsBackfill && config.lrclibUrl
    ? config.upstreams.map((upstream) => [
        upstream.id,
        new LyricsBackfill(
          library,
          lyrics,
          upstream,
          serviceAccount(sessions, upstream, { user: config.indexUser, password: config.indexPassword }),
        ),
      ])
    : [],
);
for (const backfill of backfills.values()) backfill.start();
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
  backfills,
  lrc,
  uploadDir: config.uploadDir,
});
const health = new HealthCheck(config.upstreams);

const server = Bun.serve({
  port: config.port,
  development: process.env.NODE_ENV !== "production",
  // Long streams must not be cut by the idle timeout.
  idleTimeout: 0,
  // Uploads are one file per request; a long hi-res track is over Bun's 128 MB default.
  maxRequestBodySize: MAX_UPLOAD_BYTES,
  websocket: { ...api.listenSockets, maxPayloadLength: 16 * 1024 },
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
    "/api/listen": { POST: api.listenCreate },
    "/api/listen/:code": { GET: (request, srv) => api.listenSocket(request, srv) },
    "/api/lyrics/coverage": { GET: api.lyricsCoverage },
    "/api/doctor": { GET: api.doctor },
    "/api/lyrics/missing": { GET: api.lyricsMissing },
    "/api/lyrics/refetch": { POST: api.lyricsRefetch },
    "/api/lyrics/written": { DELETE: api.lyricsWritten },
    "/api/upload": { GET: api.upload, PUT: api.upload },
    "/api/lyrics/:songId": { GET: api.songLyrics },
    "/api/lyrics/:songId/offset": { GET: api.lyricsOffset, PUT: api.lyricsOffset },
    "/api/playlists/:id/hidden": { GET: api.playlistHidden, PUT: api.playlistHidden },
    "/api/history": { GET: api.history, POST: api.history },
    "/api/settings": { GET: api.userSettings, PUT: api.userSettings },
    "/api/moments": { GET: api.moments, POST: api.moments },
    "/api/moments/:id": { PATCH: api.moment, DELETE: api.moment },
    "/api/prefs": { GET: api.prefs },
    "/api/prefs/:kind/:id": { PUT: api.setPref },
    "/api/radio/bans": { GET: api.radioBans, POST: api.radioBans, DELETE: api.radioBans },
    "/api/stats": { GET: api.stats },
    "/api/stats/forgotten": { GET: api.forgotten },
    "/api/index": { GET: api.searchIndex, POST: api.searchIndex },
    "/api/search": { GET: api.searchLibrary },
    "/api/import/match": { POST: api.importMatch },
    "/api/search/lyrics": { GET: api.searchLyrics },
    "/fonts/:name": font,
    ...pwaRoutes,
    ...webRoutes,
  },
});

console.log(
  `keep-player ${VERSION} on :${server.port} → ${config.upstreams.map((upstream) => `${upstream.id} ${upstream.url}`).join(", ")}`,
);
