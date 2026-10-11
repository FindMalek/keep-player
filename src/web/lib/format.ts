export function clock(seconds: number | undefined): string {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

/** "1 h 12 min" for album and playlist lengths. */
export function length(seconds: number | undefined): string {
  const minutes = Math.round((seconds ?? 0) / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

export function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

/** "FLAC · 16-bit" style quality label. */
export function quality(suffix?: string, bitRate?: number): string {
  if (!suffix) return "";
  const lossless = ["flac", "alac", "wav", "aiff", "ape", "wv", "dsf"].includes(suffix.toLowerCase());
  return lossless ? suffix.toUpperCase() : `${suffix.toUpperCase()} ${bitRate ?? ""}`.trim();
}
