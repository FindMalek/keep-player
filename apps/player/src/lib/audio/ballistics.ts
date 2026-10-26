import { dbToGain, gainToDb } from "@/lib/audio/decibels";

/** All times are in milliseconds. */
interface BallisticsOptions {
  attackMs: number;
  releaseMs: number;
  /** How long the peak-hold marker stays before it starts to fall. 0 disables it. */
  peakHoldMs: number;
  peakReleaseMs: number;
}

const BALLISTICS = {
  instant: { attackMs: 0, peakHoldMs: 0, peakReleaseMs: 0, releaseMs: 0 },
  peak: { attackMs: 15, peakHoldMs: 1200, peakReleaseMs: 600, releaseMs: 350 },
  vu: { attackMs: 300, peakHoldMs: 0, peakReleaseMs: 300, releaseMs: 300 },
} as const satisfies Record<string, BallisticsOptions>;

type BallisticsPreset = keyof typeof BALLISTICS;

export type BallisticsInput = BallisticsPreset | Partial<BallisticsOptions>;

const resolveBallistics = (
  input: BallisticsInput = "peak"
): BallisticsOptions => {
  if (typeof input === "string") {
    return BALLISTICS[input];
  }
  return { ...BALLISTICS.peak, ...input };
};

interface BallisticsState {
  db: number;
  holdDb: number;
}

interface Ballistics {
  step: (inputDb: number, nowMs: number) => BallisticsState;
  reset: () => void;
}

const smoothingFactor = (elapsedMs: number, timeConstantMs: number): number => {
  if (timeConstantMs <= 0) {
    return 1;
  }
  return 1 - Math.exp(-elapsedMs / timeConstantMs);
};

// Smoothing runs on linear amplitude, so a falling level drops at a steady dB rate, like a hardware meter.
const createBallistics = (input?: BallisticsInput): Ballistics => {
  const options = resolveBallistics(input);
  let amplitude = 0;
  let holdAmplitude = 0;
  let holdUntilMs = 0;
  let lastMs: number | null = null;

  const reset = () => {
    amplitude = 0;
    holdAmplitude = 0;
    holdUntilMs = 0;
    lastMs = null;
  };

  const step = (inputDb: number, nowMs: number): BallisticsState => {
    const target = dbToGain(inputDb);

    if (lastMs === null) {
      amplitude = target;
    } else {
      const elapsedMs = Math.max(0, nowMs - lastMs);
      const timeConstant =
        target > amplitude ? options.attackMs : options.releaseMs;
      amplitude +=
        (target - amplitude) * smoothingFactor(elapsedMs, timeConstant);
    }

    if (options.peakHoldMs <= 0) {
      holdAmplitude = amplitude;
    } else if (amplitude >= holdAmplitude) {
      holdAmplitude = amplitude;
      holdUntilMs = nowMs + options.peakHoldMs;
    } else if (nowMs > holdUntilMs && lastMs !== null) {
      const elapsedMs = Math.max(0, nowMs - Math.max(lastMs, holdUntilMs));
      holdAmplitude -=
        (holdAmplitude - amplitude) *
        smoothingFactor(elapsedMs, options.peakReleaseMs);
    }

    lastMs = nowMs;
    return { db: gainToDb(amplitude), holdDb: gainToDb(holdAmplitude) };
  };

  return { reset, step };
};
