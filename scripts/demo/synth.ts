import { random } from "./random";

const RATE = 44_100;
const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
};
const PROGRESSIONS = [
  [0, 3, 4, 3],
  [0, 5, 3, 4],
  [0, 4, 5, 3],
  [0, 2, 3, 4],
];

export interface SynthOptions {
  seed: number;
  seconds: number;
  bpm: number;
  scale: keyof typeof SCALES;
  /** MIDI note of the tonic. */
  root: number;
}

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Stereo 16-bit PCM of a small generative piece: chords, a bass line and an arpeggio, all seeded. */
export function synth(options: SynthOptions): Uint8Array<ArrayBuffer> {
  const next = random(options.seed);
  const scale = SCALES[options.scale] as number[];
  const degree = (n: number): number => {
    const octave = Math.floor(n / scale.length);
    return (scale[((n % scale.length) + scale.length) % scale.length] as number) + octave * 12;
  };
  const progression = PROGRESSIONS[Math.floor(next() * PROGRESSIONS.length)] as number[];
  const beat = 60 / options.bpm;
  const frames = Math.floor(options.seconds * RATE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);

  const note = (start: number, length: number, midi: number, volume: number, pan: number, bright: number): void => {
    const f = hz(midi);
    const from = Math.floor(start * RATE);
    const count = Math.floor(length * RATE);
    for (let i = 0; i < count && from + i < frames; i += 1) {
      const t = i / RATE;
      const attack = Math.min(1, t / 0.01);
      const release = Math.min(1, (length - t) / 0.12);
      const decay = Math.exp(-t * (1.2 + bright));
      const wave =
        Math.sin(2 * Math.PI * f * t) + bright * 0.25 * Math.sin(4 * Math.PI * f * t) + bright * 0.1 * Math.sin(6 * Math.PI * f * t);
      const sample = wave * volume * attack * Math.max(0, release) * decay;
      left[from + i] = (left[from + i] as number) + sample * (1 - pan);
      right[from + i] = (right[from + i] as number) + sample * (1 + pan);
    }
  };

  const bars = Math.ceil(options.seconds / (beat * 4));
  const arpPattern = [0, 2, 1, 2, 0, 2, 1, 3];
  for (let bar = 0; bar < bars; bar += 1) {
    const chordRoot = progression[bar % progression.length] as number;
    const start = bar * beat * 4;
    const tones = [0, 2, 4, 6].map((offset) => options.root + degree(chordRoot + offset));
    for (const [index, midi] of tones.slice(0, 3).entries()) note(start, beat * 4, midi, 0.07, (index - 1) * 0.3, 0.2);
    note(start, beat * 2, options.root + degree(chordRoot) - 12, 0.16, 0, 0.1);
    note(start + beat * 2, beat * 2, options.root + degree(chordRoot + 4) - 12, 0.12, 0, 0.1);
    for (let step = 0; step < 8; step += 1) {
      if (next() < 0.12) continue;
      const midi = (tones[arpPattern[step] as number] as number) + 12;
      note(start + step * beat * 0.5, beat * 0.9, midi, 0.1, step % 2 ? 0.4 : -0.4, 1.4);
    }
  }

  const out = new Uint8Array(frames * 4);
  const view = new DataView(out.buffer);
  const fade = RATE * 1.5;
  for (let i = 0; i < frames; i += 1) {
    const edge = Math.min(1, i / (RATE * 0.05), (frames - i) / fade);
    const l = Math.tanh((left[i] as number) * 1.4) * edge;
    const r = Math.tanh((right[i] as number) * 1.4) * edge;
    view.setInt16(i * 4, Math.round(l * 30_000), true);
    view.setInt16(i * 4 + 2, Math.round(r * 30_000), true);
  }
  return out;
}

export const SAMPLE_RATE = RATE;
