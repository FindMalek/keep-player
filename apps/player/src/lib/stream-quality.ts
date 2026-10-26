export const QUALITIES = [
  ["original", "original"],
  ["mp3-320", "mp3 320"],
  ["opus-192", "opus 192"],
  ["opus-96", "opus 96"],
] as const;
export type StreamQuality = (typeof QUALITIES)[number][0];

/** What the browser plays when it can't play a song's own format: widely supported and still good. */
export const FALLBACK: StreamQuality = "mp3-320";

export function isStreamQuality(value: unknown): value is StreamQuality {
  return QUALITIES.some(([name]) => name === value);
}

export function streamParams(quality: StreamQuality): Record<string, string> {
  if (quality === "original") return { format: "raw" };
  const [format, bitRate] = quality.split("-") as [string, string];
  // The estimate gives the browser a length to seek in; Navidrome can't know a transcode's size up front.
  return { format, maxBitRate: bitRate, estimateContentLength: "true" };
}
