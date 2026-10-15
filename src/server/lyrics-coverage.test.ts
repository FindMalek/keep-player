import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { forgetMisses, lyricsCoverageReport, missingLyrics } from "./lyrics-coverage";
import { createIndexTables } from "./search-index";

function library() {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const song = (id: string, folder: string, albumId: string) =>
    db
      .query(
        "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('nd', 'song', ?, ?, ?, ?, 0, ?, 1)",
      )
      .run(id, folder, id, id, JSON.stringify({ id, title: id, albumId, album: `album ${albumId}`, artist: "a" }));
  const lyrics = (id: string, status: string) =>
    db
      .query("insert into lyrics (song_id, status, source, lrclib_id, body, fetched) values (?, ?, null, null, '{}', 0)")
      .run(`nd:${id}`, status);
  for (const [id, folder, album] of [
    ["s1", "1", "al1"],
    ["s2", "1", "al1"],
    ["s3", "1", "al2"],
    ["s4", "2", "al3"],
    ["s5", "1", "al2"],
  ] as const)
    song(id, folder, album);
  lyrics("s1", "synced");
  lyrics("s2", "missing");
  lyrics("s3", "plain");
  lyrics("s4", "missing");
  return db;
}

test("coverage counts each kind of lyrics, unchecked songs apart, only in the folders you may see", () => {
  const db = library();
  expect(lyricsCoverageReport(db, "nd", null)).toMatchObject({ total: 5, synced: 1, plain: 1, missing: 2, unchecked: 1 });
  const mine = lyricsCoverageReport(db, "nd", ["1"]);
  expect(mine).toMatchObject({ total: 4, synced: 1, plain: 1, missing: 1, unchecked: 1 });
  expect(mine.albums).toEqual([{ id: "al1", name: "album al1", artist: "a", total: 2, synced: 1, plain: 0, missing: 1 }]);
  expect(missingLyrics(db, "nd", ["1"], 0, 10).map((song) => song.id)).toEqual(["s2"]);
});

test("forgetting misses lets them be looked up again", () => {
  const db = library();
  expect(forgetMisses(db, "nd")).toBe(2);
  expect(lyricsCoverageReport(db, "nd", null)).toMatchObject({ missing: 0, unchecked: 3 });
});
