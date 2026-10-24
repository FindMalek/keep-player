import { player, type Sleep } from "@/lib/player";

export const SLEEP_OPTIONS = [
  ["off", "off"],
  ["15", "15 minutes"],
  ["30", "30 minutes"],
  ["45", "45 minutes"],
  ["60", "1 hour"],
  ["track", "end of this song"],
  ["album", "end of this album"],
] as const;

/** The radio value for the current timer (a countdown has no option of its own). */
export const sleepValue = (sleep: Sleep): string => (!sleep ? "off" : sleep.kind === "time" ? "time" : sleep.kind);

/** Pick an option: "off", minutes, "track" or "album". */
export const chooseSleep = (next: string): void =>
  player.setSleep(next === "off" ? null : next === "track" || next === "album" ? next : Number(next));
