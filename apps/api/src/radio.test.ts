import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { ban, listBans, unban } from "./radio";

test("radio bans are per account, newest first, and can be lifted", () => {
  const db = openLibraryDb(":memory:");
  ban(db, "s:me", { id: "a", title: "A" }, 1);
  ban(db, "s:me", { id: "b", title: "B" }, 2);
  ban(db, "s:other", { id: "c", title: "C" }, 3);
  ban(db, "s:me", { id: "a", title: "A" }, 4);
  expect(listBans(db, "s:me").map((song) => song.id)).toEqual(["a", "b"]);
  unban(db, "s:me", "a");
  expect(listBans(db, "s:me").map((song) => song.id)).toEqual(["b"]);
  expect(listBans(db, "s:other")).toHaveLength(1);
});
