import { expect, test } from "bun:test";
import { greyPng } from "../../../test/mock/png";
import { CoverCache, snapCoverSize } from "./covers";

const dir = () => `${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`;
const png = () => new Response(greyPng(300, 80), { headers: { "content-type": "image/png" } });

test("sizes snap up to the ladder", () => {
  expect([10, 64, 65, 300, 5000].map(snapCoverSize)).toEqual([64, 64, 128, 512, 1024]);
});

test("a cover is fetched once, even for concurrent requests, then served from disk as webp", async () => {
  let fetches = 0;
  const cache = new CoverCache(dir(), 1_000_000);
  const fetcher = async () => {
    fetches += 1;
    return png();
  };
  const [first, second] = await Promise.all([cache.get("a", 128, fetcher, "a"), cache.get("a", 128, fetcher, "a")]);
  await cache.get("a", 128, fetcher, "a");
  expect(first).toBe(second);
  expect(fetches).toBe(1);
  expect(new TextDecoder().decode((await Bun.file(first as string).bytes()).subarray(8, 12))).toBe("WEBP");
});

test("the least recently used covers go first when the cache is full", async () => {
  let now = 0;
  // Each 64 px grey webp is ~66 bytes: room for two.
  const cache = new CoverCache(dir(), 150, () => now);
  const keep = await cache.get("keep", 64, async () => png(), "keep");
  now = 1;
  const drop = await cache.get("drop", 64, async () => png(), "drop");
  now = 2;
  await cache.get("keep", 64, async () => png(), "keep");
  now = 3;
  await cache.get("new", 64, async () => png(), "new");
  expect(await Bun.file(keep as string).exists()).toBe(true);
  expect(await Bun.file(drop as string).exists()).toBe(false);
});
