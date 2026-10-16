import { useEffect, useMemo, useRef } from "react";
import { type AuraParams, type AuraSong, auraParams, blurPixels, drawAura } from "@/lib/aura";
import { useSetting } from "@/lib/settings";
import { subscribeTheme } from "@/lib/theme";

/** The theme's own ink and paper, read when drawing so light and dark both work. */
function colors(): { ink: string; paper: string } {
  const tokens = getComputedStyle(document.documentElement);
  return {
    ink: tokens.getPropertyValue("--foreground").trim() || "CanvasText",
    paper: tokens.getPropertyValue("--background").trim() || "Canvas",
  };
}

// A slow drift, so a few frames a second; a frame that took long pushes the next one back.
const FRAME_MS = 200;

/**
 * A playlist's aura as a backdrop: a canvas painted at half resolution (it is a soft picture), drifting slowly while it is
 * on screen and the tab is visible, and still under reduced motion.
 */
export function Aura({ id, songs, className }: { id: string; songs: AuraSong[]; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduce = useSetting("reduceMotion");
  const params = useMemo(() => auraParams(id, songs), [id, songs]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const still = reduce || matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    let started = performance.now();
    const paint = () => {
      const { ink, paper } = colors();
      drawAura(context, element.width, element.height, params, ink, paper, still ? 0 : (performance.now() - started) / 1000, false);
    };
    const fit = () => {
      element.width = Math.max(64, Math.ceil(element.clientWidth / 2));
      element.height = Math.max(32, Math.ceil(element.clientHeight / 2));
      started = performance.now();
      paint();
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(element);
    const watch = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    watch.observe(element);
    const unsubscribe = subscribeTheme(paint);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const began = performance.now();
      if (visible && !document.hidden) paint();
      timer = setTimeout(tick, Math.max(FRAME_MS, (performance.now() - began) * 4));
    };
    if (!still) timer = setTimeout(tick, FRAME_MS);
    return () => {
      resize.disconnect();
      watch.disconnect();
      unsubscribe();
      clearTimeout(timer);
    };
  }, [params, reduce]);

  // The blur is the element's, not the pixels': the canvas is half resolution, so half the radius per CSS pixel.
  return <canvas ref={canvas} aria-hidden className={className} style={{ filter: `blur(${(blurPixels(params, 1) * 2).toFixed(1)}px)` }} />;
}

/** Download the still aura as a square PNG, for a playlist cover that shows up in other Subsonic apps too. */
export function exportAura(id: string, songs: AuraSong[], name: string, size = 1024): void {
  const target = document.createElement("canvas");
  target.width = size;
  target.height = size;
  const context = target.getContext("2d");
  if (!context) return;
  const params: AuraParams = auraParams(id, songs);
  const { ink, paper } = colors();
  drawAura(context, size, size, params, ink, paper, 0);
  target.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {
      href: url,
      download: `${name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "playlist"}-aura.png`,
    }).click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
