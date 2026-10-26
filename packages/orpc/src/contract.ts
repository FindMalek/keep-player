import { albumSchema, mixSchema, songSchema } from "@keep/shared/library";
import { listeningStatsSchema } from "@keep/shared/stats";
import { oc } from "@orpc/contract";
import { z } from "zod";

/*
 * The API's contract: every procedure's input and output, in Zod. `apps/api` implements it, the player calls it
 * through a client typed from it (`/api/rpc`), and the same procedures are plain HTTP under `/api` for integrations,
 * documented at `/api` (spec at `/api/spec.json`). Areas move here from the hand-written routes one at a time.
 *
 * Numbers are `z.coerce`: over HTTP they arrive as query strings, over RPC as numbers.
 */

const DAY = 86_400_000;
const tz = z.coerce.number().int().min(-840).max(840);

export const contract = {
  version: oc.route({ method: "GET", path: "/version", summary: "The running version", tags: ["Server"] }).output(
    z.object({
      version: z.string(),
      /** Admins only, when the server checks for releases (`UPDATE_CHECK=on`). */
      latest: z.string().nullable(),
      updateAvailable: z.boolean(),
    }),
  ),

  stats: {
    range: oc
      .route({
        method: "GET",
        path: "/stats",
        summary: "Your listening in a time range",
        description:
          "From your plays in keep music: minutes, top songs, artists, albums and genres, a listening clock and day totals. At most 400 days.",
        tags: ["Stats"],
      })
      .input(
        z
          .object({
            from: z.coerce.number().describe("Start, ms since the epoch"),
            to: z.coerce.number().describe("End, ms since the epoch"),
            tz: tz.default(0).describe("Minutes east of UTC, for days and hours"),
          })
          .refine((range) => range.from < range.to, "from before to")
          .transform((range) => ({ ...range, from: Math.max(range.from, range.to - 400 * DAY) })),
      )
      .output(listeningStatsSchema),
    forgotten: oc
      .route({ method: "GET", path: "/stats/forgotten", summary: "Favourites you haven't played in a while", tags: ["Stats"] })
      .input(z.object({ days: z.coerce.number().int().min(1).max(3650).default(60).describe("Not played in this many days") }))
      .output(z.object({ songs: z.array(songSchema) })),
  },

  mixes: oc
    .route({
      method: "GET",
      path: "/mixes",
      summary: "Everything made for you right now",
      description: "Daily mixes, discover weekly, the daylist, release radar, on this day, and with Groq the mood and weekly playlists.",
      tags: ["Mixes"],
    })
    .input(
      z.object({
        day: z.coerce.number().int().describe("Your local days since the epoch"),
        hour: z.coerce.number().int().min(0).max(23).describe("Your local hour"),
        tz: tz.describe("Your getTimezoneOffset(), in minutes"),
      }),
    )
    .output(z.object({ day: z.number(), mixes: z.array(mixSchema) })),

  artists: {
    appearsOn: oc
      .route({
        method: "GET",
        path: "/artists/{id}/appears-on",
        summary: "Albums by others an artist appears on",
        description: "Features, compilations and soundtracks, from the library index, in the folders you may see.",
        tags: ["Library"],
      })
      .input(z.object({ id: z.string().min(1) }))
      .output(z.object({ albums: z.array(albumSchema) })),
  },
};

export type Contract = typeof contract;
