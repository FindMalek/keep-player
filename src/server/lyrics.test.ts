import { afterAll, expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { closestByDuration, LyricsService, mainArtist, normalizeTitle } from "./lyrics";

test("titles lose the noise lyric databases don't have", () => {
  expect(normalizeTitle("Let It Be (Remastered 2009)")).toBe("Let It Be");
  expect(normalizeTitle("Song - Live at Wembley")).toBe("Song");
  expect(normalizeTitle("Track (feat. Someone) [Explicit]")).toBe("Track");
  expect(normalizeTitle("Hello ft. Friend")).toBe("Hello");
  expect(normalizeTitle("Love (Is All)")).toBe("Love (Is All)");
  expect(mainArtist("A feat. B")).toBe("A");
  expect(mainArtist("A & B")).toBe("A");
});

test("search results match by length: within 2 s yes, beyond 5 s never", () => {
  const record = (id: number, duration: number) => ({
    id,
    trackName: "",
    artistName: "",
    duration,
    instrumental: false,
    plainLyrics: "x",
    syncedLyrics: "[00:01.00]x",
  });
  expect(closestByDuration([record(1, 190), record(2, 201.5)], 200)?.id).toBe(2);
  expect(closestByDuration([record(1, 210)], 200)).toBeNull();
});

// Stand-ins for Navidrome and LRCLIB.
let lrclibUp = true;
const lrclibCalls: string[] = [];
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/rest/")) {
      const id = url.searchParams.get("id");
      const ok = (payload: object) => Response.json({ "subsonic-response": { status: "ok", ...payload } });
      if (url.pathname === "/rest/getLyricsBySongId")
        return ok({ lyricsList: { structuredLyrics: id === "own" ? [{ synced: true, line: [{ start: 1000, value: "mine" }] }] : [] } });
      if (url.pathname === "/rest/getSong")
        return ok({ song: { id, title: `${id} (Remastered)`, artist: "Band", album: "LP", duration: 200 } });
    }
    lrclibCalls.push(url.pathname + url.search);
    if (!lrclibUp) return new Response("busy", { status: 503 });
    if (url.pathname === "/lrc/api/get") return new Response("not found", { status: 404 });
    const title = url.searchParams.get("track_name");
    if (title === "hit")
      return Response.json([
        {
          id: 7,
          trackName: "hit",
          artistName: "Band",
          duration: 201,
          instrumental: false,
          plainLyrics: "a",
          syncedLyrics: "[00:02.00]found",
        },
      ]);
    return Response.json([]);
  },
});
afterAll(() => server.stop());

const upstream = { id: "default", url: `http://127.0.0.1:${server.port}` };
const credentials = { user: "u", token: "t", salt: "s" };

test("Navidrome first, then LRCLIB search by normalized title and closest length; misses cached, outages not", async () => {
  let now = 0;
  const service = new LyricsService(openLibraryDb(":memory:"), `http://127.0.0.1:${server.port}/lrc`, () => now);
  expect((await service.get(upstream, credentials, "own")).lines[0]?.text).toBe("mine");

  const hit = await service.get(upstream, credentials, "hit");
  expect([hit.status, hit.source, hit.lines[0]?.text]).toEqual(["synced", "lrclib", "found"]);
  expect(lrclibCalls.some((call) => call.includes("track_name=hit&"))).toBe(true);

  expect((await service.get(upstream, credentials, "nothing")).status).toBe("missing");
  const calls = lrclibCalls.length;
  await service.get(upstream, credentials, "nothing");
  expect(lrclibCalls.length).toBe(calls);
  now = 31 * 86_400_000;
  await service.get(upstream, credentials, "nothing");
  expect(lrclibCalls.length).toBeGreaterThan(calls);

  lrclibUp = false;
  expect((await service.get(upstream, credentials, "later")).status).toBe("missing");
  lrclibUp = true;
  expect(service.cached("later")).toBeNull();
});
