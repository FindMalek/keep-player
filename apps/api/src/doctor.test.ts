import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { runChecks } from "@keep/shared/doctor";
import { libraryItems } from "./doctor";
import { createIndexTables } from "./search-index";

test("the doctor reads the index and reports what's missing", () => {
  const db = new Database(":memory:");
  createIndexTables(db);
  const put = (kind: string, data: Record<string, unknown> & { id: string }) =>
    db
      .query(
        "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', ?, ?, '1', 'n', 'n', 0, ?, 1)",
      )
      .run(kind, data.id, JSON.stringify(data));
  put("song", { id: "1", title: "A", artist: "X" });
  put("album", { id: "a", name: "Album" });
  const { songs, albums } = libraryItems(db, "s");
  expect(songs).toHaveLength(1);
  expect(runChecks(songs, albums).checks.find((check) => check.id === "no-cover")?.count).toBe(1);
  expect(libraryItems(db, "other").songs).toHaveLength(0);
});
