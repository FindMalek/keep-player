import { afterAll, expect, test } from "bun:test";
import { audiomuseStatus, type Features, featuresFor, similarSongs, smartShuffle, syncFeatures } from "./audiomuse";
import { openLibraryDb } from "./db";
import { createIndexTables } from "./search-index";

const muse = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/similar_tracks")
      return Response.json([{ item_id: url.searchParams.get("item_id") }, { item_id: "gone" }, { item_id: "b" }, { item_id: "hidden" }]);
    if (Number(url.searchParams.get("offset") ?? 0) > 0) return Response.json([]);
    return Response.json([
      { item_id: "a", tempo: 124.04, key: "A", scale: "minor", energy: 0.8, valence: 0.9, danceability: 0.7 },
      { item_id: "unknown", tempo: 100, key: "C", scale: "major", energy: 0.5, valence: 0.5, danceability: 0.5 },
      { item_id: "b", tempo: 0, key: "C", scale: "major", energy: 0.5, valence: 0.5, danceability: 0.5 },
    ]);
  },
});
afterAll(() => muse.stop());
const url = `http://127.0.0.1:${muse.port}`;

function seeded() {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  for (const [id, folder] of [
    ["a", "1"],
    ["b", "1"],
    ["hidden", "2"],
  ] as const)
    db.query("insert into idx_items values ('s', 'song', ?, ?, 'n', 'n', 0, ?, 1)").run(id, folder, JSON.stringify({ id, title: id }));
  return db;
}

test("sync keeps only valid analysed songs the index knows, and status counts them", async () => {
  const db = seeded();
  expect(await audiomuseStatus(null, db, "s")).toEqual({ enabled: false, reachable: false, analysed: 0 });
  expect(await syncFeatures(db, "s", url)).toBe(1);
  expect(featuresFor(db, "s").get("a")).toEqual({ bpm: 124, key: "A minor", energy: 0.8, valence: 0.9, danceability: 0.7 });
  expect(await audiomuseStatus(url, db, "s")).toEqual({ enabled: true, reachable: true, analysed: 1 });
  expect((await audiomuseStatus("http://127.0.0.1:1", db, "s")).reachable).toBe(false);
});

test("sonic neighbours are index songs the person may see, without the seed itself", async () => {
  const songs = await similarSongs(seeded(), "s", url, "a", ["1"]);
  expect(songs.map((song) => song.id)).toEqual(["b"]);
});

const song = (bpm: number, key: string, energy: number): Features => ({ bpm, key, energy, valence: 0.5, danceability: 0.5 });

test("smart shuffle flows by tempo and key, builds energy up and leaves unanalysed songs last", () => {
  const features = new Map<string, Features>([
    ["slow", song(80, "C major", 0.1)],
    ["mid-near", song(100, "G major", 0.4)],
    ["mid-far", song(100, "F# major", 0.45)],
    ["peak", song(128, "G major", 0.9)],
    ["peak-half", song(64, "G major", 0.88)],
  ]);
  const ordered = smartShuffle(["peak", "none", "mid-far", "slow", "peak-half", "mid-near"], features);
  expect(ordered[0]).toBe("slow");
  expect(ordered.slice(-1)).toEqual(["none"]);
  expect(ordered.indexOf("mid-near")).toBeLessThan(ordered.indexOf("mid-far"));
  expect(ordered.indexOf("peak")).toBeGreaterThan(ordered.indexOf("mid-near"));
  expect([...ordered].sort()).toEqual(["mid-far", "mid-near", "none", "peak", "peak-half", "slow"]);
});
