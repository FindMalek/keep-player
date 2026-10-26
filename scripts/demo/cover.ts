import { greyscalePng } from "./png";
import { random } from "./random";

/** 8x8 Bayer matrix, values 0..63. */
const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
] as const;

/** A smooth field in 0..1 chosen by the seed: rings, a lit sphere, diagonal waves or a horizon fade. */
function field(kind: number, seed: number): (x: number, y: number) => number {
  const next = random(seed);
  const cx = 0.25 + next() * 0.5;
  const cy = 0.25 + next() * 0.5;
  const freq = 2 + Math.floor(next() * 5);
  const angle = next() * Math.PI;
  switch (kind % 4) {
    case 0:
      return (x, y) => 0.5 + 0.5 * Math.cos(Math.hypot(x - cx, y - cy) * freq * Math.PI * 2);
    case 1:
      return (x, y) => {
        const d = Math.hypot(x - cx, y - cy);
        return d > 0.38 ? 0.08 : 1 - d / 0.38 + (1 - x) * 0.15;
      };
    case 2:
      return (x, y) => 0.5 + 0.5 * Math.sin((x * Math.cos(angle) + y * Math.sin(angle)) * freq * Math.PI * 2);
    default:
      return (x, y) => (y < cy ? y / cy : 1 - (y - cy) / (1 - cy)) * (0.7 + 0.3 * Math.sin(x * freq * Math.PI));
  }
}

/** Monochrome ordered-dither album art, deterministic per seed; `levels` greys (2 is pure black and white). */
export function ditheredCover(seed: number, size = 600, levels = 4): Uint8Array<ArrayBuffer> {
  const f = field(seed, seed * 7919 + 13);
  const pixels = new Uint8Array(size * size);
  const step = 255 / (levels - 1);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = Math.min(1, Math.max(0, f(x / size, y / size))) * (levels - 1);
      const base = Math.floor(value);
      const threshold = ((BAYER[(y >> 1) % 8]?.[(x >> 1) % 8] ?? 0) + 0.5) / 64;
      const level = value - base > threshold ? base + 1 : base;
      pixels[y * size + x] = Math.round(Math.min(levels - 1, level) * step);
    }
  }
  return greyscalePng(size, pixels);
}
