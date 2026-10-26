import { expect, test } from "bun:test";
import { appearsOn } from "./appears-on";
import { openLibraryDb } from "./db";
import { createIndexTables } from "./search-index";

test("appears on is albums by others with this artist on a song, in the folders you can see", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const put = (kind: string, id: string, folder: string, data: object) =>
    db
      .query(
        "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', ?, ?, ?, 'n', 'n', 0, ?, 1)",
      )
      .run(kind, id, folder, JSON.stringify({ id, ...data }));
  put("album", "own", "1", { artistId: "ar-1" });
  put("album", "comp", "1", { artistId: "va", year: 2001 });
  put("album", "hidden", "2", { artistId: "va" });
  put("song", "s1", "1", { albumId: "own", artistId: "ar-1" });
  put("song", "s2", "1", { albumId: "comp", artistId: "other", artists: [{ id: "other" }, { id: "ar-1" }] });
  put("song", "s3", "2", { albumId: "hidden", artistId: "ar-1" });
  put("song", "s4", "1", { albumId: "comp", artistId: "ar-10" });

  expect(appearsOn(db, "s", "ar-1", ["1"]).map((album) => album.id)).toEqual(["comp"]);
  expect(
    appearsOn(db, "s", "ar-1", null)
      .map((album) => album.id)
      .sort(),
  ).toEqual(["comp", "hidden"]);
});
