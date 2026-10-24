/** Slack after a song's end: the next song's entry can lag a poll behind. */
const GRACE_MINUTES = 1;

/**
 * Navidrome's `minutesAgo` counts from when the song started, and the entry lingers after it stops. So it's still
 * playing while that is within the song's length (plus a little), not within a fixed couple of minutes: a fixed cutoff
 * dropped every song two minutes in.
 */
export function stillPlaying(entry: { minutesAgo?: number; duration?: number }): boolean {
  const lengthMinutes = (entry.duration ?? 0) / 60;
  return (entry.minutesAgo ?? 0) <= lengthMinutes + GRACE_MINUTES;
}
