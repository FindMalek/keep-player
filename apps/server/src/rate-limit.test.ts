import { expect, test } from "bun:test";
import { LoginLimiter } from "./rate-limit";

test("three free failures, then the wait doubles, and success resets it", () => {
  const now = 0;
  const limiter = new LoginLimiter(3, 60_000, () => now);
  const keys = ["ip:1.2.3.4"];
  for (let i = 0; i < 3; i += 1) limiter.fail(keys);
  expect(limiter.retryAfter(keys)).toBe(0);
  limiter.fail(keys);
  expect(limiter.retryAfter(keys)).toBe(1);
  limiter.fail(keys);
  expect(limiter.retryAfter(keys)).toBe(2);
  limiter.succeed(keys);
  expect(limiter.retryAfter(keys)).toBe(0);
});
