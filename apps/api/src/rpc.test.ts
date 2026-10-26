import { afterAll, expect, test } from "bun:test";
import { createKeepClient } from "@keep/orpc/client";
import { createApi } from "./api";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { LyricsService } from "./lyrics";
import { LoginLimiter } from "./rate-limit";
import { SessionStore } from "./sessions";

const upstream = Bun.serve({ port: 0, fetch: () => Response.json({ "subsonic-response": { status: "ok" } }) });
afterAll(() => upstream.stop());

const sessions = new SessionStore(":memory:", "secret", 60_000);
const api = createApi({
  upstreams: [{ id: "default", url: `http://127.0.0.1:${upstream.port}` }],
  indexes: new Map(),
  library: openLibraryDb(":memory:"),
  lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
  covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
  sessions,
  limiter: new LoginLimiter(),
  idleSeconds: 60,
  trustProxy: false,
});
const cookie = sessions.create({ server: "default", user: "demo", token: "t", salt: "s", agent: "" });
const client = (headers: Record<string, string>) => createKeepClient("http://app/api/rpc", headers, (request) => api.rpc(request));

test("the typed client reaches the procedures signed in, is turned away signed out, and bad input never runs", async () => {
  const signedIn = client({ "x-keep-player": "1", cookie: `kp_session=${cookie}` });
  expect(await signedIn.stats.forgotten({ days: 30 })).toEqual({ songs: [] });
  expect(await signedIn.mixes({ day: 20_000, hour: 9, tz: 0 })).toEqual({ day: 20_000, mixes: [] });

  await expect(client({ "x-keep-player": "1" }).stats.forgotten({ days: 30 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(signedIn.stats.range({ from: 2, to: 1, tz: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  // Without the CSRF header the route answers 403 before oRPC sees it.
  await expect(client({ cookie: `kp_session=${cookie}` }).stats.forgotten({ days: 30 })).rejects.toBeDefined();
});

test("over plain HTTP: a bearer token signs in, a cookie needs the CSRF header, the spec lists the procedures", async () => {
  const token = sessions.create({ server: "default", user: "demo", token: "t", salt: "s", agent: "integration" });
  const call = (path: string, headers: Record<string, string> = {}) => api.http(new Request(`http://app${path}`, { headers }));

  const withToken = await call("/api/stats/forgotten?days=30", { authorization: `Bearer ${token}` });
  expect(withToken.status).toBe(200);
  expect(await withToken.json()).toEqual({ songs: [] });
  expect((await call("/api/stats/forgotten", { cookie: `kp_session=${cookie}` })).status).toBe(401);
  expect((await call("/api/stats/forgotten", { cookie: `kp_session=${cookie}`, "x-keep-player": "1" })).status).toBe(200);

  const spec = (await (await call("/api/spec.json")).json()) as { paths: Record<string, unknown> };
  expect(Object.keys(spec.paths)).toContain("/artists/{id}/appears-on");
});

test("the terminal's token only reaches what's playing; an api token made in settings reaches the api", async () => {
  const mint = async (make: (request: Request) => Response) => {
    const request = new Request("http://app/token", { method: "POST", headers: { "x-keep-player": "1", cookie: `kp_session=${cookie}` } });
    return ((await make(request).json()) as { token: string }).token;
  };
  const stats = (token: string) =>
    api.http(new Request("http://app/api/stats/forgotten", { headers: { authorization: `Bearer ${token}` } }));

  expect((await stats(await mint(api.remoteToken))).status).toBe(401);
  expect((await stats(await mint(api.apiToken))).status).toBe(200);
});

test("neither token counts as the browser cookie", async () => {
  const mint = async (make: (request: Request) => Response) => {
    const request = new Request("http://app/token", { method: "POST", headers: { "x-keep-player": "1", cookie: `kp_session=${cookie}` } });
    return ((await make(request).json()) as { token: string }).token;
  };
  for (const token of [await mint(api.remoteToken), await mint(api.apiToken)]) {
    const headers = { "x-keep-player": "1", cookie: `kp_session=${token}` };
    await expect(client(headers).stats.forgotten({ days: 30 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(api.apiToken(new Request("http://app/token", { method: "POST", headers })).status).toBe(401);
  }
});
