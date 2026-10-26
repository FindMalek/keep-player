type FrameListener = (nowMs: number) => void;
type FramePhase = "update" | "paint";

const listeners = {
  paint: new Set<FrameListener>(),
  update: new Set<FrameListener>(),
};
let handle: number | null = null;
let ticking = false;

const hasListeners = () => listeners.update.size + listeners.paint.size > 0;

const reportError = (error: unknown) => {
  queueMicrotask(() => {
    throw error;
  });
};

const tick = (nowMs: number) => {
  handle = null;
  ticking = true;
  for (const phase of [listeners.update, listeners.paint]) {
    for (const listener of phase) {
      try {
        listener(nowMs);
      } catch (error) {
        reportError(error);
      }
    }
  }
  ticking = false;
  if (hasListeners() && handle === null) {
    handle = requestAnimationFrame(tick);
  }
};

export const subscribeFrame = (
  listener: FrameListener,
  phase: FramePhase = "paint"
): (() => void) => {
  listeners[phase].add(listener);
  if (
    handle === null &&
    !ticking &&
    typeof requestAnimationFrame === "function"
  ) {
    handle = requestAnimationFrame(tick);
  }
  return () => {
    listeners[phase].delete(listener);
    if (!hasListeners() && handle !== null) {
      cancelAnimationFrame(handle);
      handle = null;
    }
  };
};

type FrameTaskStep = (nowMs: number) => boolean;

interface FrameTask {
  wake: () => void;
  /** Stops the task for good. A stopped task ignores `wake`. */
  stop: () => void;
}

// A task that returns false sleeps and requests no frames until `wake()`, so a settled or hidden painter costs nothing.
const createFrameTask = (step: FrameTaskStep): FrameTask => {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;

  const sleep = () => {
    unsubscribe?.();
    unsubscribe = null;
  };

  const run = (nowMs: number) => {
    if (!step(nowMs)) {
      sleep();
    }
  };

  const wake = () => {
    if (!stopped && unsubscribe === null) {
      unsubscribe = subscribeFrame(run);
    }
  };

  wake();

  return {
    stop: () => {
      stopped = true;
      sleep();
    },
    wake,
  };
};

const MAX_FRAME_GAP_MS = 100;

// Never advances more than MAX_FRAME_GAP_MS at once, so a painter that slept resumes instead of jumping to the end.
const createPainterClock = (): ((nowMs: number) => number) => {
  let lastMs: number | null = null;
  let clockMs = 0;
  return (nowMs) => {
    if (lastMs !== null) {
      clockMs += Math.min(Math.max(0, nowMs - lastMs), MAX_FRAME_GAP_MS);
    }
    lastMs = nowMs;
    return clockMs;
  };
};
