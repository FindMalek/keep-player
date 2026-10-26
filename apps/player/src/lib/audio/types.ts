interface ChannelLevel {
  peakDb: number;
  rmsDb?: number;
}

interface MeterFrame {
  channels: ChannelLevel[];
}

interface VisualFrame {
  bands: Float32Array;
  history: Float32Array;
  /** Index of the oldest entry in `history`. */
  historyStart: number;
  historyLength: number;
  historyUpdatedAt?: number;
  /** Minimum time between entries, used for playback delay. 0 disables smoothing. */
  historyIntervalMs?: number;
  historyPreviousLevel?: number;
  timeDomain?: Float32Array;
  peakDb: number;
}

export interface FrameSource<T> {
  subscribe: (listener: (frame: T) => void) => () => void;
}

type MeterZoneName = "ok" | "warn" | "clip";

export interface MeterZone {
  fromDb: number;
  zone: MeterZoneName;
}

interface Taper {
  toPosition: (value: number) => number;
  toValue: (position: number) => number;
}

export type Orientation = "horizontal" | "vertical";
