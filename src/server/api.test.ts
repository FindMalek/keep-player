import { afterAll, expect, test } from "bun:test";
import { createApi } from "./api";
import { CoverCache } from "./covers";
import { LoginLimiter } from "./rate-limit";
import { SessionStore } from "./sessions";

// A stand-in Navidrome that records what the proxy sent it.
const seen: URL[] = [];
const upstream = Bun.serve({
  port: 0,
  fetch(request) {
    seen.push(new URL(request.url));
    return Response.json({ "subsonic-response": { status: "ok" } });
  },
});
afterAll(() => upstream.stop());

const sessions = new SessionStore(":memory:", "secret", 60_000);
const api = createApi({
  upstreams: [{ id: "default", url: `http://127.0.0.1:${upstream.port}` }],
  covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
  sessions,
  limiter: new LoginLimiter(),
  idleSeconds: 60,
  trustProxy: false,
});
const cookie = sessions.create({ server: "default", user: "demo", token: "server-token", salt: "server-salt", agent: "" });
const request = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://app${path}`, { headers: { cookie: `kp_session=${cookie}`, ...headers } });

test("the proxy replaces any client credentials with the session's", async () => {
  const response = await api.proxy(request("/rest/getAlbum?id=1&u=evil&t=x&s=y&p=pw&apiKey=k", { "x-keep-player": "1" }));
  expect(response.status).toBe(200);
  const sent = seen.at(-1)?.searchParams;
  expect([sent?.get("u"), sent?.get("t"), sent?.get("s"), sent?.get("p"), sent?.get("apiKey"), sent?.get("id")]).toEqual([
    "demo",
    "server-token",
    "server-salt",
    null,
    null,
    "1",
  ]);
});

test("the proxy refuses unlisted endpoints, missing sessions and non-media calls without the CSRF header", async () => {
  expect((await api.proxy(request("/rest/deleteUser?username=demo", { "x-keep-player": "1" }))).status).toBe(404);
  expect((await api.proxy(new Request("http://app/rest/getAlbum?id=1", { headers: { "x-keep-player": "1" } }))).status).toBe(401);
  expect((await api.proxy(request("/rest/star?id=1"))).status).toBe(403);
  expect((await api.proxy(request("/rest/stream?id=1"))).status).toBe(200);
});
