import { z } from "zod";
import { songSchema } from "./library";

/** One row of a top list: a song, artist, album or genre, with counted plays (skips excluded) and minutes. */
export const statItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  plays: z.number(),
  minutes: z.number(),
  /** The artist, for songs and albums. */
  detail: z.string().optional(),
  /** Songs only: the song as it was played, to play it again. */
  song: songSchema.optional(),
});
export type StatItem = z.infer<typeof statItemSchema>;

/** Your listening in a range. */
export const listeningStatsSchema = z.object({
  from: z.number(),
  to: z.number(),
  minutes: z.number(),
  /** Counted plays (not skips). */
  plays: z.number(),
  skips: z.number(),
  /** Different songs played. */
  songs: z.number(),
  /** Of those, first heard in this range vs heard before it. */
  discovery: z.object({ fresh: z.number(), familiar: z.number() }),
  /** Days in a row with a play, all time. */
  streaks: z.object({ current: z.number(), longest: z.number() }),
  top: z.object({
    songs: z.array(statItemSchema),
    artists: z.array(statItemSchema),
    albums: z.array(statItemSchema),
    genres: z.array(statItemSchema),
  }),
  /** Minutes by weekday (0 = Sunday) × hour, local time. */
  clock: z.array(z.array(z.number())),
  /** Minutes per local day (YYYY-MM-DD) across the range. */
  days: z.array(z.object({ day: z.string(), minutes: z.number() })),
});
export type ListeningStats = z.infer<typeof listeningStatsSchema>;
