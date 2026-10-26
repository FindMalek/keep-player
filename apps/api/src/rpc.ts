import type { Database } from "bun:sqlite";
import { contract } from "@keep/orpc";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { appearsOn } from "./appears-on";
import { type Cache, memoryCache } from "./cache";
import type { Upstream } from "./config";
import { type UpdateCheck, VERSION } from "./health";
import { readPlays, recordPlay } from "./history";
import type { LyricsService } from "./lyrics";
import { listening, madeForYou, mixesVersion, slotOf } from "./mixes";
import { addMoment, deleteMoment, listMoments, updateMoment } from "./moments";
import { type Groq, moodMixes } from "./mood-mixes";
import { changeAlbum, changeSong, readPrefs } from "./prefs";
import { ban, listBans, unban } from "./radio";
import type { Session } from "./sessions";
import { forgottenFavourites, listeningStats } from "./stats";
import { weeklyPlaylists } from "./weekly-playlists";

/*
 * The oRPC side of the API (`/api/rpc/*`): `@keep/orpc`'s contract implemented over the server's own services.
 * Inputs are checked against the contract's schemas before a handler runs; `createApi` checks the CSRF header and
 * finds the session first, so a handler only ever sees a signed-in user (or the `UNAUTHORIZED` it throws).
 */

export interface RpcDeps {
  library: Database;
  updates: UpdateCheck;
  groq: Groq | null;
  fetcher: typeof fetch;
  upstreamFor(id: string): Upstream | undefined;
  foldersFor(session: Session, upstream: Upstream): Promise<string[]>;
  cache?: Cache;
  lyrics: LyricsService;
}

/** `client`: the browser's id (`x-keep-client`), so a play says which device it was on. */
type Context = { session: Session | null; client: string };

/** Whose data it is: history, prefs, lyrics offsets and the rest are kept per server and user. */
export const accountOf = (session: Session) => `${session.server}:${session.user}`;

const MIXES_TTL_MS = 60 * 60_000;
const GROQ_MISS_TTL_MS = 2 * 60_000;
const OK = { ok: true } as const;

function readSettings(db: Database, account: string) {
  const row = db
    .query<{ body: string; updated: number }, [string]>("select body, updated from user_settings where account = ?")
    .get(account);
  return row ? { settings: JSON.parse(row.body) as Record<string, unknown>, updated: row.updated } : { settings: null, updated: 0 };
}

const hiddenIn = (db: Database, account: string, playlist: string): string[] =>
  db
    .query<{ song_id: string }, [string, string]>("select song_id from playlist_hidden where account = ? and playlist_id = ?")
    .all(account, playlist)
    .map((row) => row.song_id);

export function createRpc({ library, updates, groq, fetcher, upstreamFor, foldersFor, cache = memoryCache(), lyrics }: RpcDeps) {
  const os = implement(contract).$context<Context>();
  const signedIn = os.use(({ context, next }) => {
    if (!context.session) throw new ORPCError("UNAUTHORIZED", { message: "signed out" });
    return next({ context: { session: context.session, account: accountOf(context.session) } });
  });

  const router = os.router({
    version: signedIn.version.handler(async ({ context }) => {
      const info = await updates.info();
      return context.session.admin ? info : { version: info.version, latest: null, updateAvailable: false };
    }),
    stats: {
      range: signedIn.stats.range.handler(({ context, input }) =>
        listeningStats(library, accountOf(context.session), input.from, input.to, input.tz),
      ),
      forgotten: signedIn.stats.forgotten.handler(({ context, input }) => ({
        songs: forgottenFavourites(library, accountOf(context.session), input.days),
      })),
    },
    mixes: signedIn.mixes.handler(async ({ context, input }) => {
      const { session } = context;
      const account = accountOf(session);
      // ~30 ms with 10k songs, and the same answer until the slot, a play, the index or a "never" pref changes.
      const key = `mixes:${account}:${input.day}:${slotOf(input.hour)}:${input.tz}:${mixesVersion(library, session.server, account)}`;
      const cached = await cache.get<{ day: number; mixes: Awaited<ReturnType<typeof madeForYou>> }>(key);
      if (cached) return cached;
      const made = madeForYou(library, session.server, account, { day: input.day, hour: input.hour, tzMinutes: input.tz });
      const heard = groq ? listening(library, session.server, account, Date.now()) : null;
      const moods = await moodMixes(library, groq, account, input.day, heard, fetcher);
      const weekly = await weeklyPlaylists(library, groq, account, input.day, heard, fetcher);
      const result = { day: input.day, mixes: [...made, ...moods, ...weekly] };
      // Empty means not ready yet (no plays, the index building): asked again, never kept. Groq coming back empty is
      // most likely a timeout or a rate limit, so that answer is kept only briefly.
      const groqMissed = groq && (!moods.length || !weekly.length);
      if (result.mixes.length) await cache.set(key, result, groqMissed ? GROQ_MISS_TTL_MS : MIXES_TTL_MS);
      return result;
    }),
    artists: {
      appearsOn: signedIn.artists.appearsOn.handler(async ({ context, input }) => {
        const upstream = upstreamFor(context.session.server);
        if (!upstream) throw new ORPCError("UNAUTHORIZED", { message: "server removed from config" });
        return { albums: appearsOn(library, upstream.id, input.id, await foldersFor(context.session, upstream)) };
      }),
    },
    history: {
      list: signedIn.history.list.handler(({ context, input }) => ({
        plays: readPlays(library, context.account, input.before ?? Date.now() + 1, input.limit),
      })),
      add: signedIn.history.add.handler(({ context, input }) => {
        recordPlay(library, context.account, context.client, input);
        return OK;
      }),
    },
    moments: {
      list: signedIn.moments.list.handler(({ context, input }) => ({ moments: listMoments(library, context.account, input.song) })),
      add: signedIn.moments.add.handler(({ context, input }) => addMoment(library, context.account, input.song, input.at, input.note)),
      update: signedIn.moments.update.handler(({ context, input }) => {
        if (!updateMoment(library, context.account, input.id, input.note)) throw new ORPCError("NOT_FOUND");
        return OK;
      }),
      remove: signedIn.moments.remove.handler(({ context, input }) => {
        if (!deleteMoment(library, context.account, input.id)) throw new ORPCError("NOT_FOUND");
        return OK;
      }),
    },
    settings: {
      get: signedIn.settings.get.handler(({ context }) => readSettings(library, context.account)),
      put: signedIn.settings.put.handler(({ context, input }) => {
        library
          .query("insert or replace into user_settings (account, body, updated) values (?, ?, ?)")
          .run(context.account, JSON.stringify(input), Date.now());
        return readSettings(library, context.account);
      }),
    },
    prefs: {
      get: signedIn.prefs.get.handler(({ context }) => readPrefs(library, context.account)),
      song: signedIn.prefs.song.handler(({ context, input }) => {
        const { id, ...change } = input;
        if (!changeSong(library, context.account, id, change)) throw new ORPCError("BAD_REQUEST", { message: "invalid trim" });
        return readPrefs(library, context.account);
      }),
      album: signedIn.prefs.album.handler(({ context, input }) => {
        const { id, ...change } = input;
        changeAlbum(library, context.account, id, change);
        return readPrefs(library, context.account);
      }),
    },
    radio: {
      bans: signedIn.radio.bans.handler(({ context }) => ({ songs: listBans(library, context.account) })),
      ban: signedIn.radio.ban.handler(({ context, input }) => {
        ban(library, context.account, input.song);
        return { songs: listBans(library, context.account) };
      }),
      unban: signedIn.radio.unban.handler(({ context, input }) => {
        unban(library, context.account, input.id);
        return { songs: listBans(library, context.account) };
      }),
    },
    playlists: {
      hidden: signedIn.playlists.hidden.handler(({ context, input }) => ({ songs: hiddenIn(library, context.account, input.id) })),
      hide: signedIn.playlists.hide.handler(({ context, input }) => {
        library
          .query(
            input.hidden
              ? "insert or ignore into playlist_hidden (account, playlist_id, song_id) values (?, ?, ?)"
              : "delete from playlist_hidden where account = ? and playlist_id = ? and song_id = ?",
          )
          .run(context.account, input.id, input.songId);
        return { songs: hiddenIn(library, context.account, input.id) };
      }),
    },
    lyrics: {
      offset: signedIn.lyrics.offset.handler(({ context, input }) => ({ offset: lyrics.offset(context.account, input.songId) })),
      setOffset: signedIn.lyrics.setOffset.handler(({ context, input }) => {
        lyrics.setOffset(context.account, input.songId, input.offset);
        return OK;
      }),
    },
  });

  const rpcHandler = new RPCHandler(router);
  // The same procedures as plain HTTP for integrations, with the reference (Scalar) at /api and the spec at /api/spec.json.
  const httpHandler = new OpenAPIHandler(router, {
    plugins: [
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
        docsTitle: "keep music API",
        // Pinned: the page runs on the player's origin, where the session cookie works.
        docsScriptUrl: "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.74.0",
        specGenerateOptions: {
          info: {
            title: "keep music API",
            version: VERSION,
            description:
              "Everything the keep music player does, for your own integrations. Sign in with a token from the player " +
              "(settings → sync → api token) as `Authorization: Bearer <token>`. The player itself uses the same procedures over `/api/rpc`.",
          },
          components: { securitySchemes: { token: { type: "http", scheme: "bearer" } } },
          security: [{ token: [] }],
        },
      }),
    ],
  });
  const clientOf = (request: Request) => request.headers.get("x-keep-client") ?? "";
  const notFound = () => Response.json({ error: "no such procedure" }, { status: 404 });
  return {
    rpc: async (request: Request, session: Session | null): Promise<Response> => {
      const { matched, response } = await rpcHandler.handle(request, {
        prefix: "/api/rpc",
        context: { session, client: clientOf(request) },
      });
      return matched ? response : notFound();
    },
    http: async (request: Request, session: Session | null): Promise<Response> => {
      const { matched, response } = await httpHandler.handle(request, { prefix: "/api", context: { session, client: clientOf(request) } });
      return matched ? response : notFound();
    },
  };
}
