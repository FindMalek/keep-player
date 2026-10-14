import { join } from "node:path";
import { createApi } from "./server/api";
import { config } from "./server/config";
import { font } from "./server/fonts";
import { LoginLimiter } from "./server/rate-limit";
import { SessionStore } from "./server/sessions";
import index from "./web/index.html";

const idleSeconds = config.sessionIdleDays * 86_400;
const sessions = new SessionStore(join(config.dataDir, "sessions.db"), config.sessionSecret, idleSeconds * 1000);
setInterval(() => sessions.purgeIdle(), 3_600_000).unref();

const api = createApi({ upstreams: config.upstreams, sessions, limiter: new LoginLimiter(), idleSeconds, trustProxy: config.trustProxy });

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
    "/fonts/:name": font,
    "/*": index,
  },
});

console.log(`keep-player on :${server.port} → ${config.upstreams.map((upstream) => `${upstream.id} ${upstream.url}`).join(", ")}`);
