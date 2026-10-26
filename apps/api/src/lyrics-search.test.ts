import { afterAll, expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { LyricsService } from "./lyrics";
import { lyricsCoverage, queryLyrics } from "./lyrics-search";
import { createIndexTables } from "./search-index";

// Navidrome serving made-up lyrics: s1 synced, s2 plain, s3 synced but in a folder some users can't see.
const lyrics: Record<string, { synced: boolean; line: { start?: number; value: string }[] }> = {
  s1: {
    synced: true,
    line: [
      { start: 0, value: "Out on the empty road tonight" },
      { start: 4000, value: "I keep on counting" },
      { start: 8000, value: "the stars above the lonely town" },
      { start: 12000, value: "Don't stop the engine now" },
    ],
  },
  s2: { synced: false, line: [{ value: "Paper boats on a river" }, { value: "Sailing where the willows grow" }] },
  s3: { synced: true, line: [{ start: 0, value: "Secret lonely town" }] },
  // A short song bm25 prefers, one word off from the line s6 really has.
  s7: { synced: false, line: [{ value: "Quicksilver mornings" }] },
  s5: { synced: false, line: [{ value: "Glass garden cinder harbor" }] },
  s6: {
    synced: false,
    line: [{ value: "Lanterns over the water" }, { value: "Glass garden cinder harper" }, { value: "Morning comes too slow" }],
  },
};
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const found = lyrics[id];
    return Response.json({
      "subsonic-response": { status: "ok", lyricsList: { structuredLyrics: found ? [{ lang: "eng", ...found }] : [] } },
    });
  },
});
afterAll(() => server.stop());

async function library() {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const service = new LyricsService(db, "");
  const upstream = { id: "default", url: `http://127.0.0.1:${server.port}` };
  for (const [id, folder] of [
    ["s1", "1"],
    ["s2", "1"],
    ["s3", "2"],
    ["s4", "1"],
    ["s5", "1"],
    ["s6", "1"],
  ] as const) {
    db.query(
      "insert into idx_items (server, kind, id, folder, name, norm, data, generation) values ('default', 'song', ?, ?, ?, ?, ?, 1)",
    ).run(id, folder, id, id, JSON.stringify({ id, title: id }));
    if (id !== "s4") await service.get(upstream, { user: "u", token: "t", salt: "s" }, id);
  }
  return db;
}

test("finds the line, with context and where it starts, ignoring apostrophes and line breaks", async () => {
  const db = await library();
  const [hit] = queryLyrics(db, "default", "dont stop the eng", 10, ["1"]);
  expect(hit).toMatchObject({
    line: 3,
    start: 12000,
    before: "the stars above the lonely town",
    text: "Don't stop the engine now",
    after: "",
  });
  expect(hit?.highlights.map(([from, to]) => hit.text.slice(from, to))).toEqual(["Don't", "stop", "the", "engine"]);

  expect(queryLyrics(db, "default", "counting the stars", 10, ["1"])[0]).toMatchObject({ line: 1, start: 4000 });
  expect(queryLyrics(db, "default", "willows", 10, ["1"])[0]).toMatchObject({ song: { id: "s2" }, line: 1, start: null });
});

test("forgives misspellings, ranks phrases first and keeps other folders out", async () => {
  const db = await library();
  expect(queryLyrics(db, "default", "lonley twon", 10, ["1"]).map((hit) => hit.song.id)).toEqual(["s1"]);
  expect(queryLyrics(db, "default", "lonely town", 10, null).map((hit) => hit.song.id)).toEqual(["s3", "s1"]);
  expect(queryLyrics(db, "default", "secret", 10, ["1"])).toEqual([]);
  expect(queryLyrics(db, "default", "galss garden cinder harper", 10, ["1"]).map((hit) => hit.song.id)).toEqual(["s6", "s5"]);
  expect(lyricsCoverage(db, "default")).toEqual({ checked: 5, total: 6 });
});

test("lyrics cached after a search can be found by a misspelling straight away", async () => {
  const db = await library();
  expect(queryLyrics(db, "default", "quicksilvr", 10, null)).toEqual([]);
  db.query(
    "insert into idx_items (server, kind, id, folder, name, norm, data, generation) values ('default', 'song', 's7', '1', 's7', 's7', ?, 1)",
  ).run(JSON.stringify({ id: "s7", title: "s7" }));
  await new LyricsService(db, "").get(
    { id: "default", url: `http://127.0.0.1:${server.port}` },
    { user: "u", token: "t", salt: "s" },
    "s7",
  );
  expect(queryLyrics(db, "default", "quicksilvr", 10, null).map((hit) => hit.song.id)).toEqual(["s7"]);
});
