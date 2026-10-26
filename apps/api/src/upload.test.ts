import { expect, test } from "bun:test";
import { uploadPath } from "./upload";

test("an upload keeps its folders but can't leave the inbox or be anything but music", () => {
  expect(uploadPath("/inbox", "Big Roshi/Album/01 Song.flac")).toBe("/inbox/Big Roshi/Album/01 Song.flac");
  expect(uploadPath("/inbox", "../etc/passwd.mp3")).toBeNull();
  expect(uploadPath("/inbox", "album/run.sh")).toBeNull();
});
