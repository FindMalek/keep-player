import type { Song } from "./types";

/*
 * Crossfade (#23): the next song starts `seconds` before the playing one ends and the two trade places on equal-power
 * curves (the sum of their powers stays constant, so the middle of the fade is no quieter than the ends).
 */

export const MAX_CROSSFADE = 12;
/** A manual skip fades out over this long instead of the full crossfade. */
export const SKIP_FADE_SECONDS = 0.3;

/**
 * Consecutive tracks of one album, played in order, never crossfade: that is how records meant to be heard (a live
 * album, a suite), and gapless already joins them.
 */
export function continuesAlbum(from: Song | undefined, to: Song | undefined): boolean {
  if (!from || !to || !from.albumId || from.albumId !== to.albumId) return false;
  const disc = (song: Song) => song.discNumber ?? 1;
  if (disc(from) === disc(to)) return (to.track ?? Number.NaN) === (from.track ?? Number.NaN) + 1;
  return disc(to) === disc(from) + 1 && to.track === 1;
}

/** The crossfade between two songs: 0 (gapless) for the same song looping and for album-continuing neighbours. */
export function fadeBetween(seconds: number, from: Song | undefined, to: Song | undefined): number {
  if (!(seconds > 0) || !from || !to || from.id === to.id || continuesAlbum(from, to)) return 0;
  return Math.min(MAX_CROSSFADE, seconds);
}

/** The fade can't be longer than half of either song. */
export function fitFade(seconds: number, fromDuration: number, toDuration: number): number {
  const half = Math.min(fromDuration, toDuration) / 2;
  return Number.isFinite(half) ? Math.max(0, Math.min(seconds, half)) : seconds;
}

/** Gain curves for the song coming in (sin) and going out (cos), scaled by each song's ReplayGain factor. */
export function equalPower(fadeIn: number, fadeOut: number, points = 64): { incoming: Float32Array; outgoing: Float32Array } {
  const incoming = new Float32Array(points);
  const outgoing = new Float32Array(points);
  for (let i = 0; i < points; i += 1) {
    const angle = (i / (points - 1)) * (Math.PI / 2);
    incoming[i] = Math.sin(angle) * fadeIn;
    outgoing[i] = Math.cos(angle) * fadeOut;
  }
  return { incoming, outgoing };
}
