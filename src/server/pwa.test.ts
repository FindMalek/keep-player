import { expect, test } from "bun:test";
import { inflateSync } from "node:zlib";
import { iconPng, MANIFEST, pwaRoutes } from "./pwa";

test("the icon is a valid PNG of the right size: dark corners, a light triangle in the middle", () => {
  const png = iconPng(32);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(png.buffer);
  expect([view.getUint32(16), view.getUint32(20)]).toEqual([32, 32]);
  // One IDAT chunk right after IHDR (8 signature + 25 IHDR bytes).
  const length = view.getUint32(33);
  const pixels = inflateSync(png.subarray(41, 41 + length));
  const at = (x: number, y: number) => pixels[y * (32 * 3 + 1) + 1 + x * 3] as number;
  expect(at(0, 0)).toBe(0x10);
  expect(at(14, 16)).toBe(0xeb);
});

test("the manifest makes the app installable: standalone, a start url, 192 and 512 icons", async () => {
  expect(MANIFEST.display).toBe("standalone");
  expect(MANIFEST.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  const response = pwaRoutes["/manifest.webmanifest"]();
  expect(response.headers.get("content-type")).toBe("application/manifest+json");
  expect((await response.json()).start_url).toBe("/");
  expect(pwaRoutes["/icons/192.png"]().headers.get("content-type")).toBe("image/png");
});
