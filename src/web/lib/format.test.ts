import { expect, test } from "bun:test";
import { clock } from "./format";

test("clock pads seconds and switches to hours past 60 minutes", () => {
  expect(clock(65)).toBe("1:05");
  expect(clock(3725)).toBe("1:02:05");
});
