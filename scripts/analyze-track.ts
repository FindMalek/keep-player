import { writeFileSync } from "node:fs";

// Finds the tempo, the beat grid and the energy shape of a music file, so the film's cuts can be locked to it:
// bun scripts/analyze-track.ts apps/video/public/music/track.mp3   (writes apps/video/src/track.json)
const file = process.argv[2] ?? "apps/video/public/music/track.mp3";
const RATE = 22050;
const HOP = 512;

const decode = Bun.spawnSync(["ffmpeg", "-loglevel", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], {
  stdout: "pipe",
});
const raw = decode.stdout;
const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));

// Low-passed energy per hop (kick and bass carry the pulse), then how much it jumps from one hop to the next.
const hops = Math.floor(samples.length / HOP);
const low = new Float32Array(hops);
const full = new Float32Array(hops);
let state = 0;
for (let h = 0; h < hops; h += 1) {
  let lowSum = 0;
  let fullSum = 0;
  for (let i = h * HOP; i < (h + 1) * HOP; i += 1) {
    const x = samples[i] as number;
    state += 0.06 * (x - state);
    lowSum += state * state;
    fullSum += x * x;
  }
  low[h] = Math.sqrt(lowSum / HOP);
  full[h] = Math.sqrt(fullSum / HOP);
}
const onset = new Float32Array(hops);
for (let h = 1; h < hops; h += 1) onset[h] = Math.max(0, Math.log1p(40 * (low[h] as number)) - Math.log1p(40 * (low[h - 1] as number)));

// Tempo: the lag where the onset envelope best repeats itself, between 70 and 180 bpm.
const hopSeconds = HOP / RATE;
let best = { bpm: 120, score: -1, lag: 0 };
for (let bpm = 70; bpm <= 180; bpm += 0.25) {
  const lag = 60 / bpm / hopSeconds;
  let score = 0;
  for (let h = Math.ceil(lag); h < hops; h += 1) {
    const a = onset[h] as number;
    const frac = h - lag;
    const lo = Math.floor(frac);
    const b = (onset[lo] as number) * (1 - (frac - lo)) + (onset[lo + 1] as number) * (frac - lo);
    score += a * b;
  }
  if (score > best.score) best = { bpm, score, lag };
}

// Fine pass: score whole beat grids (tempo and phase together) against the onsets, with sub-hop positions.
const at = (position: number) => {
  const lo = Math.floor(position);
  return (onset[lo] as number) * (1 - (position - lo)) + ((onset[lo + 1] as number) ?? 0) * (position - lo);
};
let grid = { bpm: best.bpm, phase: 0, score: -1, period: best.lag };
for (let bpm = best.bpm - 4; bpm <= best.bpm + 4; bpm += 0.05) {
  const period = 60 / bpm / hopSeconds;
  for (let offset = 0; offset < period; offset += 0.5) {
    let score = 0;
    for (let position = offset; position < hops - 2; position += period) score += at(position);
    if (score > grid.score) grid = { bpm, phase: offset, score, period };
  }
}
const beats: number[] = [];
for (let position = grid.phase; position < hops; position += grid.period) beats.push(Number((position * hopSeconds).toFixed(3)));
best = { bpm: grid.bpm, score: grid.score, lag: grid.period };

// Energy per half second, and where it rises most sharply (a drop or a lift).
const step = Math.round(0.5 / hopSeconds);
const energy: number[] = [];
for (let h = 0; h + step <= hops; h += step) {
  let sum = 0;
  for (let i = h; i < h + step; i += 1) sum += full[i] as number;
  energy.push(Number((sum / step).toFixed(4)));
}
const rises = energy.map((value, index) => ({
  at: index * 0.5,
  jump: index >= 4 ? value - energy.slice(index - 4, index).reduce((a, b) => a + b, 0) / 4 : 0,
}));
const drops = rises
  .sort((a, b) => b.jump - a.jump)
  .slice(0, 3)
  .map((rise) => rise.at)
  .sort((a, b) => a - b);

const result = {
  file,
  bpm: Number(best.bpm.toFixed(2)),
  firstBeat: beats[0],
  duration: Number((samples.length / RATE).toFixed(2)),
  beats,
  energy,
  drops,
};
writeFileSync(process.argv[3] ?? "apps/video/src/track.json", `${JSON.stringify(result)}\n`);
console.log(
  `${result.bpm} bpm, first beat ${result.firstBeat}s, ${beats.length} beats, ${result.duration}s, biggest lifts at ${drops.join("s, ")}s`,
);
