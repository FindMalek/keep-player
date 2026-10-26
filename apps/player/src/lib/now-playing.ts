const GRACE_MINUTES = 1;

// `minutesAgo` counts from the song's start and the entry lingers after it stops, so compare with the song's length:
// a fixed two-minute cutoff dropped every song two minutes in.
export function stillPlaying(entry: { minutesAgo?: number; duration?: number }): boolean {
  const lengthMinutes = (entry.duration ?? 0) / 60;
  return (entry.minutesAgo ?? 0) <= lengthMinutes + GRACE_MINUTES;
}
