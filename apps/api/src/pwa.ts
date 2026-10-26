import { deflateSync } from "node:zlib";

/*
 * The installable app (#53): a web manifest and a monochrome icon set, drawn here so there are no binary files to keep
 * in sync with the brand: the favicon's dark square with a light play triangle.
 */

const DARK = [0x10, 0x10, 0x10] as const;
const LIGHT = [0xeb, 0xeb, 0xeb] as const;

/** The play triangle in a 16×16 box (the favicon's path: M5 3.5v9l7-4.5z), shrunk toward the center for maskable icons. */
function insideTriangle(x: number, y: number, scale: number): boolean {
  const u = (x - 8) / scale + 8;
  const v = (y - 8) / scale + 8;
  if (u < 5 || v < 3.5 || v > 12.5) return false;
  // Right edge: from (5, 3.5) to (12, 8) and back to (5, 12.5).
  const half = (12 - 5) * (1 - Math.abs(v - 8) / 4.5);
  return u <= 5 + half;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(bytes: Uint8Array): number {
  let c = -1;
  for (const byte of bytes) c = (CRC[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A square RGB PNG of the icon, 4× supersampled so the triangle's edges are smooth. */
export function iconPng(size: number, maskable = false): Uint8Array<ArrayBuffer> {
  const scale = maskable ? 0.7 : 1;
  const raw = new Uint8Array(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++)
          if (insideTriangle(((x + (sx + 0.5) / 4) / size) * 16, ((y + (sy + 0.5) / 4) / size) * 16, scale)) hits++;
      const t = hits / 16;
      const at = y * (size * 3 + 1) + 1 + x * 3;
      for (let channel = 0; channel < 3; channel++)
        raw[at + channel] = Math.round((DARK[channel] as number) * (1 - t) + (LIGHT[channel] as number) * t);
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  header.set([8, 2, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#101010"/><path d="M5 3.5v9l7-4.5z" fill="#ebebeb"/></svg>`;

export const MANIFEST = {
  name: "keep music",
  short_name: "keep music",
  description: "a monochrome web player for your Navidrome library",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#101010",
  theme_color: "#101010",
  categories: ["music", "entertainment"],
  icons: [
    { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/512.png", sizes: "512x512", type: "image/png" },
    { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

const DAY = 86_400;
const cache = new Map<string, Uint8Array<ArrayBuffer>>();
const png = (key: string, make: () => Uint8Array<ArrayBuffer>) => {
  let bytes = cache.get(key);
  if (!bytes) {
    bytes = make();
    cache.set(key, bytes);
  }
  return new Response(bytes, { headers: { "content-type": "image/png", "cache-control": `public, max-age=${DAY}` } });
};

export const pwaRoutes = {
  "/manifest.webmanifest": () =>
    new Response(JSON.stringify(MANIFEST), {
      headers: { "content-type": "application/manifest+json", "cache-control": `public, max-age=${DAY}` },
    }),
  "/icons/icon.svg": () =>
    new Response(ICON_SVG, { headers: { "content-type": "image/svg+xml", "cache-control": `public, max-age=${DAY}` } }),
  "/icons/192.png": () => png("192", () => iconPng(192)),
  "/icons/512.png": () => png("512", () => iconPng(512)),
  "/icons/maskable-512.png": () => png("m512", () => iconPng(512, true)),
};
