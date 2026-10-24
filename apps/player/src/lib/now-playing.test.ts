import { expect, test } from "bun:test";
import { stillPlaying } from "./now-playing";

test("another device stays playing for the whole song, not just its first two minutes", () => {
  const song = { duration: 300 };
  expect(stillPlaying({ ...song, minutesAgo: 4 })).toBe(true);
  expect(stillPlaying({ ...song, minutesAgo: 7 })).toBe(false);
});
