import { z } from "zod";
import { songSchema } from "./library";

export const statItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  plays: z.number(),
  minutes: z.number(),
  detail: z.string().optional(),
  song: songSchema.optional(),
});
export type StatItem = z.infer<typeof statItemSchema>;

export const listeningStatsSchema = z.object({
  from: z.number(),
  to: z.number(),
  minutes: z.number(),
  plays: z.number(),
  skips: z.number(),
  songs: z.number(),
  /** Of those, first heard in this range vs heard before it. */
  discovery: z.object({ fresh: z.number(), familiar: z.number() }),
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
