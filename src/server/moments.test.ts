import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { addMoment, deleteMoment, listMoments, momentNotes, updateMoment } from "./moments";

test("moments: many per song, per account, edited and deleted only by their owner", () => {
  const db = openLibraryDb(":memory:");
  const song = { id: "s1", title: "One" };
  const drop = addMoment(db, "a:me", song, 151.26, "the drop", 1);
  addMoment(db, "a:me", song, 30, "", 2);
  addMoment(db, "a:other", song, 10, "theirs", 3);
  expect(drop).toMatchObject({ at: 151.3, note: "the drop", song: { id: "s1" } });
  expect(listMoments(db, "a:me", "s1").map((moment) => moment.at)).toEqual([30, 151.3]);
  expect(listMoments(db, "a:me").map((moment) => moment.created)).toEqual([2, 1]);
  expect(updateMoment(db, "a:other", drop.id, "stolen")).toBe(false);
  expect(updateMoment(db, "a:me", drop.id, "the real drop")).toBe(true);
  expect(momentNotes(db, "a:me").get("s1")).toEqual(expect.arrayContaining(["the real drop", ""]));
  expect(deleteMoment(db, "a:other", drop.id)).toBe(false);
  expect(deleteMoment(db, "a:me", drop.id)).toBe(true);
  expect(listMoments(db, "a:me")).toHaveLength(1);
});
