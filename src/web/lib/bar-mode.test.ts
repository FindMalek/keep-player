import { expect, test } from "bun:test";
import { barModeFor } from "./bar-mode";

test("the bar's mode follows the window width", () => {
  expect(barModeFor(2560)).toBe("full");
  expect(barModeFor(1600)).toBe("full");
  expect(barModeFor(1440)).toBe("laptop");
  expect(barModeFor(1000)).toBe("laptop");
  expect(barModeFor(768)).toBe("compact");
  expect(barModeFor(640)).toBe("compact");
  expect(barModeFor(390)).toBe("mobile");
});
