import { expect, test } from "bun:test";
import { createApi } from "./api";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { LyricsService } from "./lyrics";
import { LoginLimiter } from "./rate-limit";
import { SessionStore } from "./sessions";

const sessions = new SessionStore(":memory:", "secret", 60_000);
const admin = sessions.create({ server: "default", user: "boss", token: "t", salt: "s", agent: "", admin: true });
const guest = sessions.create({ server: "default", user: "guest", token: "t", salt: "s", agent: "", admin: false });

function build(answer: Response | null) {
  const seen: { url: string; headers: Headers; body: string }[] = [];
  const api = createApi({
    upstreams: [],
    indexes: new Map(),
    library: openLibraryDb(":memory:"),
    lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
    covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
    sessions,
    limiter: new LoginLimiter(),
    idleSeconds: 60,
    trustProxy: false,
    lyterion: { url: "http://lyterion", token: "secret" },
    fetcher: (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: new Headers(init.headers), body: String(init.body) });
      if (!answer) throw new Error("down");
      return answer;
    }) as unknown as typeof fetch,
  });
  return { api, seen };
}

const post = (step: string, session: string, body: unknown) =>
  Object.assign(
    new Request(`http://app/api/wishlist/${step}`, {
      method: "POST",
      headers: { cookie: `kp_session=${session}`, "x-lodesong": "1" },
      body: JSON.stringify(body),
    }),
    { params: { step } },
  );

test("only admins add songs, and the token never leaves the server", async () => {
  const { api, seen } = build(Response.json({ title: "Widows Weep" }));
  expect((await api.wishlist(post("add", guest, { input: "shyler widows weep" }))).status).toBe(403);
  expect(seen).toHaveLength(0);
  const response = await api.wishlist(post("preview", admin, { input: " shyler widows weep " }));
  expect(await response.json()).toEqual({ title: "Widows Weep", cover: null });
  expect(seen[0]?.url).toBe("http://lyterion/api/rpc/api-reference/player/wishlist/preview");
  expect(seen[0]?.headers.get("x-lyterion-token")).toBe("secret");
  expect(JSON.parse(seen[0]?.body ?? "")).toEqual({ input: "shyler widows weep" });
});

test("lyterion's reason comes through, and a busy run is a conflict", async () => {
  const busy = build(Response.json({ message: "a run is already in progress" }, { status: 412 }));
  const response = await busy.api.wishlist(post("add", admin, { input: "ty saint laurent" }));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "a run is already in progress" });
  expect((await build(null).api.wishlist(post("status", admin, { recordingId: "wish-1" }))).status).toBe(502);
});

test("a preview cover is inlined only from known image hosts", async () => {
  const seen: string[] = [];
  const api = createApi({
    upstreams: [],
    indexes: new Map(),
    library: openLibraryDb(":memory:"),
    lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
    covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
    sessions,
    limiter: new LoginLimiter(),
    idleSeconds: 60,
    trustProxy: false,
    lyterion: { url: "http://lyterion", token: "secret" },
    fetcher: (async (url: string | URL) => {
      seen.push(String(url));
      if (String(url).startsWith("http://lyterion")) return Response.json({ title: "t", coverUrl: nextCover });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch,
  });
  let nextCover = "https://i.ytimg.com/vi/x/mqdefault.jpg";
  expect(await (await api.wishlist(post("preview", admin, { input: "x y" }))).json()).toEqual({
    title: "t",
    cover: "data:image/jpeg;base64,AQID",
  });
  nextCover = "https://internal.example/secret.jpg";
  seen.length = 0;
  expect(((await (await api.wishlist(post("preview", admin, { input: "x y" }))).json()) as { cover: unknown }).cover).toBeNull();
  expect(seen).toEqual(["http://lyterion/api/rpc/api-reference/player/wishlist/preview"]);
});
