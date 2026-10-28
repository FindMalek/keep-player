import { afterAll, expect, test } from "bun:test";
import { createApi } from "./api";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { DeviceHub } from "./devices";
import { LyricsService } from "./lyrics";
import { LoginLimiter } from "./rate-limit";
import { IndexSync } from "./search-index";
import { SessionStore } from "./sessions";

// A stand-in Navidrome that records what the proxy sent it.
const seen: URL[] = [];
let streamAborted: Promise<void> | null = null;
const upstream = Bun.serve({
  port: 0,
  fetch(request) {
    seen.push(new URL(request.url));
    if (new URL(request.url).searchParams.get("id") === "endless") {
      // An audio stream that never ends on its own; resolves `streamAborted` when the proxy hangs up.
      streamAborted = new Promise((resolve) => request.signal.addEventListener("abort", () => resolve()));
      return new Response(new ReadableStream({ pull: (controller) => controller.enqueue(new Uint8Array(1024)) }));
    }
    return Response.json({ "subsonic-response": { status: "ok" } });
  },
});
afterAll(() => upstream.stop());

const sessions = new SessionStore(":memory:", "secret", 60_000);
const navidrome = { id: "default", url: `http://127.0.0.1:${upstream.port}` };
const api = createApi({
  upstreams: [navidrome],
  indexes: new Map([["default", new IndexSync(openLibraryDb(":memory:"), navidrome, () => null)]]),
  library: openLibraryDb(":memory:"),
  lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
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
  const response = await api.proxy(request("/rest/getAlbum?id=1&u=evil&t=x&s=y&p=pw&apiKey=k", { "x-lodesong": "1" }));
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
  expect((await api.proxy(request("/rest/deleteUser?username=demo", { "x-lodesong": "1" }))).status).toBe(404);
  expect((await api.proxy(new Request("http://app/rest/getAlbum?id=1", { headers: { "x-lodesong": "1" } }))).status).toBe(401);
  expect((await api.proxy(request("/rest/star?id=1"))).status).toBe(403);
  expect((await api.proxy(request("/rest/stream?id=1"))).status).toBe(200);
});

test("a stream the browser drops is dropped upstream too", async () => {
  const browser = new AbortController();
  const response = await api.proxy(
    new Request("http://app/rest/stream?id=endless", { headers: { cookie: `kp_session=${cookie}` }, signal: browser.signal }),
  );
  await response.body?.getReader().read();
  browser.abort();
  const aborted = await Promise.race([streamAborted?.then(() => true), Bun.sleep(2000).then(() => false)]);
  expect(aborted).toBe(true);
});

test("only admins see or rebuild the search index", async () => {
  const csrf = { "x-lodesong": "1" };
  expect((await api.searchIndex(request("/api/index", csrf))).status).toBe(403);
  const admin = sessions.create({ server: "default", user: "boss", token: "t", salt: "s", agent: "", admin: true });
  const response = await api.searchIndex(new Request("http://app/api/index", { headers: { cookie: `kp_session=${admin}`, ...csrf } }));
  expect(await response.json()).toMatchObject({ songs: 0, lastSync: null, building: false });
});

test("a terminal token reads what the playing player plays and skips it; the cookie alone gets nothing", async () => {
  const hub = new DeviceHub();
  const remoteApi = createApi({
    upstreams: [navidrome],
    indexes: new Map(),
    library: openLibraryDb(":memory:"),
    lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
    covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
    sessions,
    limiter: new LoginLimiter(),
    idleSeconds: 60,
    trustProxy: false,
    devices: hub,
  });
  const got: string[] = [];
  const mac = { id: "mac", name: "chrome on mac", session: "x", send: (text: string) => got.push(text), close: () => undefined };
  hub.join("default\u0000demo", mac);
  hub.handle(
    "default\u0000demo",
    mac,
    JSON.stringify({ t: "state", state: { songs: [{ id: "s1", title: "Angel", artist: "Massive Attack" }], position: 30, playing: true } }),
  );

  const made = await remoteApi.remoteToken(
    new Request("http://app/api/remote/token", { method: "POST", headers: { cookie: `kp_session=${cookie}`, "x-lodesong": "1" } }),
  );
  const { token } = (await made.json()) as { token: string };
  expect((await remoteApi.remoteNow(request("/api/remote/now"))).status).toBe(401);

  const bearer = { authorization: `Bearer ${token}` };
  const now = await (await remoteApi.remoteNow(new Request("http://app/api/remote/now", { headers: bearer }))).json();
  expect(now).toMatchObject({
    song: { title: "Angel", artist: "Massive Attack" },
    playing: true,
    device: "chrome on mac",
    controllable: true,
  });

  const toggle = Object.assign(new Request("http://app/api/remote/toggle", { method: "POST", headers: bearer }), {
    params: { action: "toggle" },
  });
  expect((await remoteApi.remoteAction(toggle)).status).toBe(200);
  expect(JSON.parse(got.at(-1) as string)).toEqual({ t: "command", command: { action: "toggle", playing: false } });
});
