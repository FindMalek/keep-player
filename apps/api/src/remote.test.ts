import { expect, test } from "bun:test";
import type { Lyrics } from "@lodesong/shared/lyrics";
import { latestFor, lineAt } from "./remote";

const lyrics: Lyrics = {
  status: "synced",
  offset: 0,
  source: "navidrome",
  lines: [
    { start: 1000, end: 4000, text: "first" },
    { start: 4000, end: 6000, text: "second" },
    { start: 9000, end: 12000, text: "" },
  ],
};

test("the lyric line is the one sung at the playhead, with the user's nudge", () => {
  expect(lineAt(lyrics, 0.5)).toBeNull();
  expect(lineAt(lyrics, 4.2)).toBe("second");
  expect(lineAt(lyrics, 7)).toBeNull();
  expect(lineAt(lyrics, 3.5, 600)).toBe("second");
  expect(lineAt({ ...lyrics, status: "plain" }, 4.2)).toBeNull();
});

test("navidrome's now playing gives this user's latest song still within its length", () => {
  const entries = [
    { id: "a", title: "old", username: "malek", minutesAgo: 9, duration: 180 },
    { id: "b", title: "new", username: "malek", minutesAgo: 1, duration: 200 },
    { id: "c", title: "theirs", username: "sam", minutesAgo: 0, duration: 200 },
  ];
  expect(latestFor(entries, "malek")?.title).toBe("new");
  expect(latestFor(entries.slice(0, 1), "malek")).toBeNull();
});
