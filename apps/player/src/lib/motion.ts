import { flushSync } from "react-dom";

/*
 * Motion: same-document View Transitions for navigation and the side panels (styled in app.css, ≤ 200 ms, never
 * blocking input), switched off by the OS "reduce motion" setting or the in-app one (`data-motion="reduce"`).
 */

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export function reducedMotion(): boolean {
  return Boolean(media?.matches) || document.documentElement.dataset.motion === "reduce";
}

/** Run a UI update as a view transition when the browser can and motion is welcome; otherwise just run it. */
export function transition(update: () => void): void {
  if (!("startViewTransition" in document) || reducedMotion() || document.hidden) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}

/** The album whose card was just clicked: its page header takes over the card's cover (`album-cover`). */
let morphing: string | null = null;
export function setMorph(id: string | null): void {
  morphing = id;
}
/**
 * Whether this album's card was just clicked. Read during render (a render that suspends and retries reads it
 * again), and cleared with `clearMorph` once the page has committed.
 */
export function isMorphing(id: string): boolean {
  return morphing === id;
}

export function clearMorph(id: string): void {
  if (morphing === id) morphing = null;
}

// Hidden tabs don't animate (the equalizer, the progress line): marked for app.css.
if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => document.documentElement.toggleAttribute("data-hidden", document.hidden));
