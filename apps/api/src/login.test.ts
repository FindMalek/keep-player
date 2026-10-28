import { afterAll, expect, test } from "bun:test";
import { createApi } from "./api";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { LyricsService } from "./lyrics";
import { LoginLimiter } from "./rate-limit";
import { SessionStore } from "./sessions";

// Navidrome's answers to a sign-in ping: by user name here, so each failure can be asked for.
const navidrome = Bun.serve({
  port: 0,
  fetch(request) {
    const user = new URL(request.url).searchParams.get("u");
    const error = user === "banned" ? { code: 50, message: "not authorized" } : user === "demo" ? null : { code: 40, message: "wrong" };
    return Response.json({ "subsonic-response": error ? { status: "failed", error } : { status: "ok" } });
  },
});
// What NAVIDROME_URL pointing at the wrong port often hits: a web page.
const website = Bun.serve({ port: 0, fetch: () => new Response("<html>hello</html>", { headers: { "content-type": "text/html" } }) });
afterAll(() => {
  navidrome.stop();
  website.stop();
});

const api = createApi({
  upstreams: [
    { id: "home", url: `http://127.0.0.1:${navidrome.port}` },
    { id: "web", url: `http://127.0.0.1:${website.port}` },
    { id: "down", url: "http://127.0.0.1:9" },
  ],
  indexes: new Map(),
  library: openLibraryDb(":memory:"),
  lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
  covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
  sessions: new SessionStore(":memory:", "secret", 60_000),
  limiter: new LoginLimiter(),
  idleSeconds: 60,
  trustProxy: false,
});
const server = { requestIP: () => ({ address: "127.0.0.1" }) } as unknown as Parameters<typeof api.login>[1];
const signIn = async (user: string, serverId: string) => {
  const response = await api.login(
    new Request("http://app/auth/login", {
      method: "POST",
      headers: { "x-lodesong": "1", "content-type": "application/json" },
      body: JSON.stringify({ user, password: "pw", server: serverId }),
    }),
    server,
  );
  return { status: response.status, ...((await response.json()) as { reason?: string; server?: string }) };
};

test("signing in says what went wrong, so a broken setup can be told from a typo", async () => {
  expect(await signIn("demo", "home")).toMatchObject({ status: 200, server: "home" });
  expect(await signIn("nobody", "home")).toMatchObject({ status: 401, reason: "credentials" });
  expect(await signIn("banned", "home")).toMatchObject({ status: 403, reason: "forbidden" });
  expect(await signIn("demo", "web")).toMatchObject({ status: 502, reason: "not-subsonic" });
  expect(await signIn("demo", "down")).toMatchObject({ status: 502, reason: "unreachable" });
});
