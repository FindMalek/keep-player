import { afterAll, expect, test } from "bun:test";
import { HealthCheck, newer, UpdateCheck, VERSION } from "./health";

// Navidrome answers an unauthenticated ping with an auth error that still names the server.
const navidrome = Bun.serve({
  port: 0,
  fetch: () =>
    Response.json({
      "subsonic-response": { status: "failed", type: "navidrome", serverVersion: "0.64.2", openSubsonic: true, error: { code: 10 } },
    }),
});
const github = Bun.serve({ port: 0, fetch: () => Response.json({ tag_name: "v99.0.0" }) });
afterAll(() => {
  navidrome.stop();
  github.stop();
});

test("health names each server and whether it answers, without its URL", async () => {
  const health = new HealthCheck([
    { id: "home", url: `http://127.0.0.1:${navidrome.port}` },
    { id: "gone", url: "http://127.0.0.1:9" },
  ]);
  const response = await health.response();
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.version).toBe(VERSION);
  expect(body.upstreams).toMatchObject([
    { id: "home", reachable: true, server: "navidrome 0.64.2", openSubsonic: true },
    { id: "gone", reachable: false, latencyMs: null },
  ]);
  expect(JSON.stringify(body)).not.toContain("127.0.0.1");
});

test("the update check stays quiet unless turned on", async () => {
  const url = `http://127.0.0.1:${github.port}/releases/latest`;
  expect(await new UpdateCheck(false, url).info()).toEqual({ version: VERSION, latest: null, updateAvailable: false });
  expect(await new UpdateCheck(true, url).info()).toEqual({ version: VERSION, latest: "99.0.0", updateAvailable: true });
});

test("versions compare by number, not as text", () => {
  expect([newer("0.10.0", "0.9.9"), newer("1.0.0", "1.0.0"), newer("0.1.0", "0.2.0")]).toEqual([true, false, false]);
});
