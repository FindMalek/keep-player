import { expect, test } from "bun:test";
import { installHelp } from "./install-help";

const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

test("arc is told it can't install, even though it looks like chrome; safari gets add to dock", () => {
  expect(installHelp(MAC_CHROME, true)).toContain("arc can't install");
  expect(installHelp(MAC_SAFARI, false)).toBe("safari: file → add to dock");
});
