import { albumSchema, mixSchema, songSchema } from "@keep/shared/library";
import { listeningStatsSchema } from "@keep/shared/stats";
import { oc } from "@orpc/contract";
import { z } from "zod";

// The API contract: `apps/api` implements it; the same procedures are plain HTTP under `/api` for integrations.
// Numbers are `z.coerce`: over HTTP they arrive as query strings, over RPC as numbers.

const DAY = 86_400_000;
const tz = z.coerce.number().int().min(-840).max(840);
const ok = z.object({ ok: z.literal(true) });
/** A song as the server keeps it: whatever the client sent, at least an id. */
const songRef = z.looseObject({ id: z.string() });
const playSchema = z.object({
  song: songRef,
  started: z.number().describe("ms since the epoch"),
  listened: z.number().describe("Seconds actually listened"),
  skipped: z.boolean().describe("Left within 30 s without finishing"),
  client: z.string(),
});
const momentSchema = z.object({ id: z.number(), song: songSchema, at: z.number(), note: z.string(), created: z.number() });
const settingsSchema = z.object({ settings: z.record(z.string(), z.unknown()).nullable(), updated: z.number() });
const prefsSchema = z.object({
  songs: z.array(
    z.object({
      id: z.string(),
      song: songRef.nullable(),
      trimStart: z.number().nullable(),
      trimEnd: z.number().nullable(),
      never: z.boolean(),
      hidden: z.boolean(),
    }),
  ),
  albums: z.array(z.object({ id: z.string(), name: z.string(), keepOrder: z.boolean(), never: z.boolean() })),
});
const bansSchema = z.object({ songs: z.array(songRef) });
const hiddenSchema = z.object({ songs: z.array(z.string()).describe("Song ids") });

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

  history: {
    list: oc
      .route({ method: "GET", path: "/history", summary: "Your plays, newest first", tags: ["History"] })
      .input(
        z.object({
          before: z.coerce.number().optional().describe("Only plays that started before this, ms since the epoch (paging)"),
          limit: z.coerce.number().int().min(1).max(500).default(200),
        }),
      )
      .output(z.object({ plays: z.array(playSchema) })),
    add: oc
      .route({
        method: "POST",
        path: "/history",
        summary: "Record a play that just ended",
        description: "What stats, mixes and recaps are made from. Plays from the player itself are recorded already.",
        tags: ["History"],
      })
      .input(
        z.object({
          song: songRef,
          started: z.number().describe("ms since the epoch"),
          listened: z.number().min(0).lt(86_400).describe("Seconds actually listened"),
          finished: z.boolean().default(false).describe("Whether it played to its end"),
        }),
      )
      .output(ok),
  },

  moments: {
    list: oc
      .route({ method: "GET", path: "/moments", summary: "Your moments: a point in a song, with a note", tags: ["Moments"] })
      .input(z.object({ song: z.string().optional().describe("Only this song's") }))
      .output(z.object({ moments: z.array(momentSchema) })),
    add: oc
      .route({ method: "POST", path: "/moments", successStatus: 201, summary: "Save a moment", tags: ["Moments"] })
      .input(
        z.object({ song: songSchema, at: z.number().min(0).max(86_400).describe("Seconds into the song"), note: z.string().default("") }),
      )
      .output(momentSchema),
    update: oc
      .route({ method: "PATCH", path: "/moments/{id}", summary: "Change a moment's note", tags: ["Moments"] })
      .input(z.object({ id: z.coerce.number().int(), note: z.string() }))
      .output(ok),
    remove: oc
      .route({ method: "DELETE", path: "/moments/{id}", summary: "Delete a moment", tags: ["Moments"] })
      .input(z.object({ id: z.coerce.number().int() }))
      .output(ok),
  },

  settings: {
    get: oc.route({ method: "GET", path: "/settings", summary: "Your synced settings", tags: ["Settings"] }).output(settingsSchema),
    put: oc
      .route({
        method: "PUT",
        path: "/settings",
        summary: "Replace your synced settings",
        description: "A JSON object, under 8 KB.",
        tags: ["Settings"],
      })
      .input(z.record(z.string(), z.unknown()).refine((body) => JSON.stringify(body).length <= 8192, "under 8 KB"))
      .output(settingsSchema),
  },

  prefs: {
    get: oc
      .route({
        method: "GET",
        path: "/prefs",
        summary: "Your playback rules",
        description: "Per song: trims, never in shuffle or radio, hidden. Per album: keep in order, never in shuffle.",
        tags: ["Prefs"],
      })
      .output(prefsSchema),
    song: oc
      .route({ method: "PUT", path: "/prefs/songs/{id}", summary: "Change a song's rules (the fields sent)", tags: ["Prefs"] })
      .input(
        z.object({
          id: z.string().min(1),
          song: songRef.nullable().optional().describe("The song itself, kept so the rule shows without the library"),
          trimStart: z.number().nullable().optional().describe("Seconds; null clears it"),
          trimEnd: z.number().nullable().optional().describe("Seconds; null clears it"),
          never: z.boolean().optional(),
          hidden: z.boolean().optional(),
        }),
      )
      .output(prefsSchema),
    album: oc
      .route({ method: "PUT", path: "/prefs/albums/{id}", summary: "Change an album's rules (the fields sent)", tags: ["Prefs"] })
      .input(
        z.object({ id: z.string().min(1), name: z.string().optional(), keepOrder: z.boolean().optional(), never: z.boolean().optional() }),
      )
      .output(prefsSchema),
  },

  radio: {
    bans: oc.route({ method: "GET", path: "/radio/bans", summary: "Songs no radio plays for you", tags: ["Radio"] }).output(bansSchema),
    ban: oc
      .route({ method: "POST", path: "/radio/bans", summary: "Keep a song out of every radio", tags: ["Radio"] })
      .input(z.object({ song: songRef }))
      .output(bansSchema),
    unban: oc
      .route({ method: "DELETE", path: "/radio/bans/{id}", summary: "Let a song back into radios", tags: ["Radio"] })
      .input(z.object({ id: z.string().min(1) }))
      .output(bansSchema),
  },

  playlists: {
    hidden: oc
      .route({ method: "GET", path: "/playlists/{id}/hidden", summary: "Songs you hid in a playlist", tags: ["Playlists"] })
      .input(z.object({ id: z.string().min(1) }))
      .output(hiddenSchema),
    hide: oc
      .route({ method: "PUT", path: "/playlists/{id}/hidden", summary: "Hide or show a song in a playlist", tags: ["Playlists"] })
      .input(z.object({ id: z.string().min(1), songId: z.string().min(1), hidden: z.boolean() }))
      .output(hiddenSchema),
  },

  lyrics: {
    offset: oc
      .route({ method: "GET", path: "/lyrics/{songId}/offset", summary: "Your timing nudge for a song's lyrics", tags: ["Lyrics"] })
      .input(z.object({ songId: z.string().min(1) }))
      .output(z.object({ offset: z.number().describe("ms; positive shows lines later") })),
    setOffset: oc
      .route({ method: "PUT", path: "/lyrics/{songId}/offset", summary: "Nudge a song's lyrics timing", tags: ["Lyrics"] })
      .input(z.object({ songId: z.string().min(1), offset: z.number().min(-60_000).max(60_000).describe("ms") }))
      .output(ok),
  },
};

export type Contract = typeof contract;
