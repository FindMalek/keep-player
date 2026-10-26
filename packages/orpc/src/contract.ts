import { albumSchema, mixSchema, songSchema } from "@keep/shared/library";
import { listeningStatsSchema } from "@keep/shared/stats";
import { oc } from "@orpc/contract";
import { z } from "zod";

/*
 * The API's contract: every procedure's input and output, in Zod. `apps/api` implements it, the player calls it
 * through a client typed from it, so both sides agree at compile time and the server checks inputs at runtime.
 * Areas move here from the hand-written `/api/*` routes one at a time.
 */

const DAY = 86_400_000;

export const contract = {
  /** The running version; for admins, a newer release when the server checks (`UPDATE_CHECK=on`). */
  version: oc.output(z.object({ version: z.string(), latest: z.string().nullable(), updateAvailable: z.boolean() })),

  stats: {
    /** Your listening between two times (ms), days and hours in `tz` (minutes east of UTC). At most 400 days. */
    range: oc
      .input(
        z
          .object({ from: z.number(), to: z.number(), tz: z.number().int().min(-840).max(840).default(0) })
          .refine((range) => range.from < range.to, "from before to")
          .transform((range) => ({ ...range, from: Math.max(range.from, range.to - 400 * DAY) })),
      )
      .output(listeningStatsSchema),
    /** Songs you played a lot and not in `days` days. */
    forgotten: oc.input(z.object({ days: z.number().int().min(1).max(3650).default(60) })).output(z.object({ songs: z.array(songSchema) })),
  },

  /**
   * Everything made for you right now (daily mixes, discover weekly, daylist, moods, weekly playlists). `day` is the
   * browser's local days since the epoch, `hour` its local hour, `tz` its `getTimezoneOffset()`.
   */
  mixes: oc
    .input(z.object({ day: z.number().int(), hour: z.number().int().min(0).max(23), tz: z.number().int().min(-840).max(840) }))
    .output(z.object({ day: z.number(), mixes: z.array(mixSchema) })),

  artists: {
    /** Albums by someone else with this artist on them, from the index, in the folders you may see. */
    appearsOn: oc.input(z.object({ id: z.string().min(1) })).output(z.object({ albums: z.array(albumSchema) })),
  },
};

export type Contract = typeof contract;
