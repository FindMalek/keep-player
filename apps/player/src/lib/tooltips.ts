import { useSyncExternalStore } from "react";

/*
 * Tooltips (Base UI tooltip + floating-ui, ~20 KB gzip) stay off the first screen: they load when the browser is
 * idle, or on the first hover or focus of something that has one. Until then triggers render as plain markup.
 */

type TooltipModule = typeof import("@keep/ui/components/tooltip");

let loaded: TooltipModule | null = null;
let requested = false;
const listeners = new Set<() => void>();

export function loadTooltips(): void {
  if (requested) return;
  requested = true;
  void import("@keep/ui/components/tooltip").then((module) => {
    loaded = module;
    for (const listener of listeners) listener();
  });
}

/** The tooltip components once loaded, else null (render the trigger as is, and call `loadTooltips` on hover). */
export function useTooltips(): TooltipModule | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => loaded,
  );
}

/*
 * Moving from one control to the next opens the next tooltip at once: for 400 ms after a tooltip closes, triggers
 * use no delay (what Base UI's provider does, without pulling floating-ui onto the first screen).
 */
const OPEN_DELAY_MS = 400;
let warm = false;
let cool: ReturnType<typeof setTimeout> | undefined;
const warmListeners = new Set<() => void>();

function setWarm(next: boolean): void {
  if (warm === next) return;
  warm = next;
  for (const listener of warmListeners) listener();
}

/** Call when a tooltip closes. */
export function tooltipClosed(): void {
  setWarm(true);
  clearTimeout(cool);
  cool = setTimeout(() => setWarm(false), OPEN_DELAY_MS);
}

export function useOpenDelay(): number {
  return useSyncExternalStore(
    (listener) => {
      warmListeners.add(listener);
      return () => warmListeners.delete(listener);
    },
    () => (warm ? 0 : OPEN_DELAY_MS),
  );
}
