import type { FrameSource } from "@/lib/audio/types";

export interface FrameEmitter<T> extends FrameSource<T> {
  emit: (frame: T) => void;
  readonly latest: T | undefined;
}

export const createFrameEmitter = <T>(): FrameEmitter<T> => {
  const subscribers = new Set<(frame: T) => void>();
  let latest: T | undefined;

  return {
    emit: (frame) => {
      latest = frame;
      for (const subscriber of subscribers) {
        subscriber(frame);
      }
    },
    get latest() {
      return latest;
    },
    subscribe: (listener) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
  };
};

interface FrameRelay<T> extends FrameSource<T> {
  setSource: (source: FrameSource<T> | null) => void;
}

// Subscribers keep a stable subscription while the audio behind it is rebuilt.
const createFrameRelay = <T>(): FrameRelay<T> => {
  const subscribers = new Set<(frame: T) => void>();
  let source: FrameSource<T> | null = null;
  let detach: (() => void) | null = null;

  const forward = (frame: T) => {
    for (const subscriber of subscribers) {
      subscriber(frame);
    }
  };

  const attach = () => {
    if (!detach && source && subscribers.size > 0) {
      detach = source.subscribe(forward);
    }
  };

  const release = () => {
    detach?.();
    detach = null;
  };

  return {
    setSource: (next) => {
      if (next === source) {
        return;
      }
      release();
      source = next;
      attach();
    },
    subscribe: (listener) => {
      subscribers.add(listener);
      attach();
      return () => {
        subscribers.delete(listener);
        if (subscribers.size === 0) {
          release();
        }
      };
    },
  };
};
