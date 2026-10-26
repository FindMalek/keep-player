// Monochrome aura seeded by the playlist id so it's always the same; energy sets contrast and grain, softness blur,
// organic vs geometric picks a flow field or a dither. Without audio analysis, genre, era and BPM tags stand in.

export interface AuraParams {
  seed: number;
  energy: number;
  softness: number;
  organic: number;
  /** Drift speed, units of noise per second; slow on purpose. */
  speed: number;
  density: number;
  bpm: number;
}

export interface AuraSong {
  genre?: string;
  genres?: { name: string }[];
  year?: number;
  bpm?: number;
}

const LOUD = [
  "metal",
  "punk",
  "hardcore",
  "rock",
  "dance",
  "edm",
  "techno",
  "house",
  "trap",
  "hip hop",
  "hip-hop",
  "rap",
  "drum",
  "bass",
  "grunge",
];
const QUIET = [
  "ambient",
  "classical",
  "folk",
  "acoustic",
  "piano",
  "jazz",
  "lounge",
  "sleep",
  "chill",
  "new age",
  "soft",
  "instrumental",
  "lofi",
  "lo-fi",
];
const ORGANIC = ["folk", "acoustic", "classical", "jazz", "blues", "country", "singer", "world", "soul", "ambient", "piano", "indie"];
const GEOMETRIC = ["electronic", "techno", "house", "trance", "synth", "industrial", "edm", "idm", "dance", "disco", "krautrock"];

export function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

export function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
const smooth = (amount: number) => amount * amount * (3 - 2 * amount);

export function noise2(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const corner = (cx: number, cy: number) => hash(`${seed}:${cx}:${cy}`) / 4294967296;
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  return mix(mix(corner(x0, y0), corner(x0 + 1, y0), fx), mix(corner(x0, y0 + 1), corner(x0 + 1, y0 + 1), fx), fy);
}

function share(songs: AuraSong[], words: string[]): number {
  if (!songs.length) return 0;
  const hits = songs.filter((song) => {
    const names = [song.genre, ...(song.genres ?? []).map((genre) => genre.name)].join(" ").toLowerCase();
    return words.some((word) => names.includes(word));
  });
  return hits.length / songs.length;
}

export function auraParams(id: string, songs: AuraSong[]): AuraParams {
  const random = prng(hash(id));
  const loud = share(songs, LOUD);
  const quiet = share(songs, QUIET);
  const years = songs.map((song) => song.year).filter((year): year is number => Boolean(year));
  const meanYear = years.length ? years.reduce((sum, year) => sum + year, 0) / years.length : 2000;
  const bpms = songs.map((song) => song.bpm).filter((bpm): bpm is number => Boolean(bpm && bpm > 30 && bpm < 240));
  const energy = clamp(0.5 + (loud - quiet) * 0.6 + (random() - 0.5) * 0.12);
  const bpm = bpms.length ? bpms.reduce((sum, value) => sum + value, 0) / bpms.length : 70 + energy * 80;
  const organic = share(songs, ORGANIC) - share(songs, GEOMETRIC) * 0.9 + (random() - 0.5) * 0.1;
  return {
    seed: hash(id),
    energy,
    // Quiet music is soft; older recordings are warmer (softer), recent ones crisper.
    softness: clamp(0.7 - energy * 0.6 + (2000 - meanYear) / 400 + (random() - 0.5) * 0.1),
    organic: clamp(0.5 + organic),
    speed: 0.01 + (bpm / 240) * 0.05,
    density: clamp(0.35 + energy * 0.5 + (random() - 0.5) * 0.15),
    bpm,
  };
}

export function vibe(params: AuraParams): string[] {
  const tempo = params.bpm < 90 ? "slow" : params.bpm < 120 ? "mid-tempo" : "fast";
  const energy = params.energy < 0.35 ? "calm" : params.energy < 0.65 ? "steady" : "driving";
  const texture = params.organic >= 0.5 ? (params.softness >= 0.5 ? "warm" : "organic") : params.softness >= 0.5 ? "hazy" : "sharp";
  return [tempo, energy, texture];
}

export const blurPixels = (params: AuraParams, scale: number): number => params.softness * 6 * scale;

export type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function drawAura(
  ctx: Context2D,
  width: number,
  height: number,
  params: AuraParams,
  ink: string,
  paper: string,
  time = 0,
  soften = true,
): void {
  const scale = width / 640;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  // On the page the canvas element is blurred by CSS (free, on the compositor); a PNG has the blur painted in.
  const blur = blurPixels(params, scale);
  if (soften && blur > 0.4 && "filter" in ctx) ctx.filter = `blur(${blur.toFixed(2)}px)`;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  const drift = time * params.speed;
  if (params.organic >= 0.5) {
    const random = prng(params.seed);
    const lines = Math.round((60 + params.density * 260) * Math.max(0.5, scale));
    const frequency = 0.004 / Math.max(0.5, scale) + 0.002;
    ctx.lineWidth = (0.6 + params.energy * 1.4) * Math.max(0.6, scale);
    ctx.lineCap = "round";
    for (let line = 0; line < lines; line += 1) {
      let x = random() * width;
      let y = random() * height;
      ctx.globalAlpha = 0.08 + random() * 0.4 * (0.4 + params.energy);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let step = 0; step < 22; step += 1) {
        const angle = noise2(params.seed, x * frequency * 100, y * frequency * 100 + drift) * Math.PI * 4;
        x += Math.cos(angle) * 3.2 * Math.max(0.6, scale);
        y += Math.sin(angle) * 3.2 * Math.max(0.6, scale);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else {
    const cell = Math.max(3, (16 - params.density * 10) * scale);
    for (let y = cell / 2; y < height; y += cell)
      for (let x = cell / 2; x < width; x += cell) {
        const level = noise2(params.seed, x / (cell * 7), y / (cell * 7) + drift * 4);
        const radius = (cell / 2) * smooth(clamp((level - 0.25) / 0.6));
        if (radius < 0.4) continue;
        ctx.globalAlpha = 0.2 + params.energy * 0.6;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  ctx.restore();
}
