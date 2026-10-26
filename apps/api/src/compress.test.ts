import { expect, test } from "bun:test";
import { brotliDecompressSync } from "node:zlib";
import { compress } from "./compress";

const request = (encoding: string) => new Request("http://x/rest/getAlbumList2", { headers: { "accept-encoding": encoding } });
const big = { albums: Array.from({ length: 200 }, (_, i) => ({ id: `al-${i}`, name: `Album ${i}` })) };

test("compresses json the browser accepts, leaves small bodies and audio alone", async () => {
  const out = (await compress(request("gzip, br"), Response.json(big))) as Response;
  expect(out.headers.get("content-encoding")).toBe("br");
  expect(out.headers.get("vary")).toContain("accept-encoding");
  expect(JSON.parse(brotliDecompressSync(new Uint8Array(await out.arrayBuffer())).toString())).toEqual(big);

  expect((await compress(request("gzip"), Response.json(big)))?.headers.get("content-encoding")).toBe("gzip");
  expect((await compress(request("br"), Response.json({ ok: true })))?.headers.get("content-encoding")).toBeNull();
  const audio = new Response(new Uint8Array(4096), { headers: { "content-type": "audio/flac" } });
  expect(await compress(request("br"), audio)).toBe(audio);
});
