import { afterAll, expect, test } from "bun:test";
import { LyricsBackfill } from "./backfill";
import { openLibraryDb } from "./db";
import { LyricsService } from "./lyrics";

// A Navidrome with three songs and no lyrics of its own, and an LRCLIB that knows "s2" and is down when told to.
let lrclibDown = false;
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    const ok = (payload: object) => Response.json({ "subsonic-response": { status: "ok", ...payload } });
    if (url.pathname === "/rest/search3") {
      const offset = Number(url.searchParams.get("songOffset"));
      return ok({ searchResult3: { song: ["s1", "s2", "s3"].slice(offset).map((id) => ({ id })) } });
    }
    if (url.pathname === "/rest/getLyricsBySongId") return ok({ lyricsList: { structuredLyrics: [] } });
    if (url.pathname === "/rest/getSong")
      return ok({ song: { id: url.searchParams.get("id"), title: url.searchParams.get("id"), artist: "a", duration: 100 } });
    if (lrclibDown) return new Response("busy", { status: 503 });
    if (url.pathname === "/lrc/api/get") return new Response("", { status: 404 });
    return Response.json(
      url.searchParams.get("track_name") === "s2"
        ? [{ id: 1, trackName: "s2", artistName: "a", duration: 100, instrumental: false, plainLyrics: "x", syncedLyrics: null }]
        : [],
    );
  },
});
afterAll(() => server.stop());

test("walks the library song by song, resumes from its saved position, and slows down when LRCLIB is down", async () => {
  const db = openLibraryDb(":memory:");
  const lyrics = new LyricsService(db, `http://127.0.0.1:${server.port}/lrc`);
  const upstream = { id: "default", url: `http://127.0.0.1:${server.port}` };
  let account: { user: string; token: string; salt: string } | null = null;
  const backfill = new LyricsBackfill(db, lyrics, upstream, () => account);

  expect(await backfill.step()).toBe(60_000);
  account = { user: "admin", token: "t", salt: "s" };
  await backfill.step();
  await backfill.step();
  expect(lyrics.cached("default", "s1")?.status).toBe("missing");
  expect(lyrics.cached("default", "s2")?.status).toBe("plain");

  lrclibDown = true;
  const wait = await backfill.step();
  expect(wait).toBeGreaterThan(600);
  expect(lyrics.cached("default", "s3")).toBeNull();
  lrclibDown = false;
  await backfill.step();
  expect(lyrics.cached("default", "s3")?.status).toBe("missing");
  expect(db.query<{ value: string }, []>("select value from meta where key = 'lyrics-backfill-offset:default'").get()?.value).toBe("3");
});
