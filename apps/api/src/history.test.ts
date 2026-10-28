import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { readPlays, recordPlay } from "./history";

test("a short listen that didn't finish is a skip; pages go back in time, per account", () => {
  const db = openLibraryDb(":memory:");
  const play = (id: string, started: number, listened: number, finished = false, account = "s:me") =>
    recordPlay(db, account, "lodesong@x", { song: { id, title: id }, started, listened, finished });
  play("a", 1000, 200, true);
  play("b", 2000, 12);
  play("c", 3000, 25, true);
  play("d", 4000, 31);
  play("theirs", 5000, 100, true, "s:you");

  const all = readPlays(db, "s:me", Date.now(), 10);
  expect(all.map((entry) => [entry.song.id, entry.skipped])).toEqual([
    ["d", false],
    ["c", false],
    ["b", true],
    ["a", false],
  ]);
  expect(readPlays(db, "s:me", 3000, 10).map((entry) => entry.song.id)).toEqual(["b", "a"]);
  expect(readPlays(db, "s:me", Date.now(), 1).map((entry) => entry.song.id)).toEqual(["d"]);
});
