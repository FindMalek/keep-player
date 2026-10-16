import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { changeAlbum, changeSong, readPrefs } from "./prefs";

test("song rules: set, change one field, validate trims, and an all-default row disappears", () => {
  const db = openLibraryDb(":memory:");
  expect(changeSong(db, "a:me", "s1", { song: { id: "s1", title: "One" }, trimStart: 40.04 })).toBe(true);
  expect(changeSong(db, "a:me", "s1", { trimEnd: 200, never: true })).toBe(true);
  expect(readPrefs(db, "a:me").songs[0]).toMatchObject({
    id: "s1",
    trimStart: 40,
    trimEnd: 200,
    never: true,
    hidden: false,
    song: { title: "One" },
  });
  // End before the start, or nonsense, changes nothing.
  expect(changeSong(db, "a:me", "s1", { trimEnd: 30 })).toBe(false);
  expect(changeSong(db, "a:me", "s1", { trimStart: -1 })).toBe(false);
  expect(readPrefs(db, "a:me").songs[0]?.trimEnd).toBe(200);
  // Other accounts don't see it.
  expect(readPrefs(db, "a:other").songs).toEqual([]);
  changeSong(db, "a:me", "s1", { trimStart: null, trimEnd: null, never: false });
  expect(readPrefs(db, "a:me").songs).toEqual([]);
});

test("album rules keep their name and go when both flags are off", () => {
  const db = openLibraryDb(":memory:");
  changeAlbum(db, "a:me", "al1", { name: "Kind of Blue", keepOrder: true });
  changeAlbum(db, "a:me", "al1", { never: true });
  expect(readPrefs(db, "a:me").albums).toEqual([{ id: "al1", name: "Kind of Blue", keepOrder: true, never: true }]);
  changeAlbum(db, "a:me", "al1", { keepOrder: false, never: false });
  expect(readPrefs(db, "a:me").albums).toEqual([]);
});
