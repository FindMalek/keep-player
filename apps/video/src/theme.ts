import { loadFont } from "@remotion/fonts";
import { Easing, staticFile, useVideoConfig } from "remotion";

export const FPS = 60;
export const sec = (seconds: number) => Math.round(seconds * FPS);

export const MONO = '"JetBrains Mono", ui-monospace, monospace';
export const SANS = '"IBM Plex Sans", system-ui, sans-serif';

export const BG = "#08090a";
export const FG = "#f7f8f8";
export const MUTED = "#8a8f98";
export const LINE = "rgba(255,255,255,0.1)";

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_CAMERA = Easing.bezier(0.45, 0, 0.15, 1);

void loadFont({ family: "JetBrains Mono", url: staticFile("fonts/jetbrains-mono-latin-wght-normal.woff2"), weight: "100 800" });
void loadFont({ family: "IBM Plex Sans", url: staticFile("fonts/ibm-plex-sans-latin-wght-normal.woff2"), weight: "100 700" });

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export interface Box {
  portrait: boolean;
  /** The frame the screen sits in, where captions go, and the type scale (1 is the 16:9 design). */
  x: number;
  y: number;
  w: number;
  h: number;
  captionY: number;
  k: number;
}

/** Landscape keeps room under the frame for a caption; portrait stacks a tall frame over a larger caption. */
export function useBox(): Box {
  const { width, height } = useVideoConfig();
  if (height > width) return { portrait: true, x: 40, y: 250, w: width - 80, h: 1180, captionY: 1480, k: 1.12 };
  return { portrait: false, x: 160, y: 34, w: 1600, h: 900, captionY: 962, k: 1 };
}
