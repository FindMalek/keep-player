// Pure data and maths; the filters live in the deck graph (decks.ts).

export const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const MAX_DB = 12;

export const PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "bass boost": [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  "treble boost": [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  vocal: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1],
  loudness: [5, 3, 0, -1, -1, 0, 1, 3, 4, 3],
  acoustic: [4, 4, 3, 1, 1, 1, 3, 3, 3, 2],
  "late night": [3, 2, 0, -1, -2, -1, 0, 2, 3, 3],
};

export const FLAT = PRESETS.flat as number[];

export function clampGains(gains: unknown): number[] {
  const list = Array.isArray(gains) ? gains : [];
  return BANDS.map((_, index) => {
    const value = Number(list[index]);
    return Number.isFinite(value) ? Math.max(-MAX_DB, Math.min(MAX_DB, value)) : 0;
  });
}

export function presetOf(gains: number[]): string | null {
  return Object.entries(PRESETS).find(([, preset]) => preset.every((value, index) => value === gains[index]))?.[0] ?? null;
}

/** Linear gain that keeps boosted bands from clipping: the loudest boost, taken off the whole signal. */
export function headroom(gains: number[]): number {
  return 10 ** (-Math.max(0, ...gains) / 20);
}

export const fromDb = (db: number): number => 10 ** (db / 20);
