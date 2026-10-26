import type { Database } from "bun:sqlite";
import { contract } from "@keep/orpc";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { appearsOn } from "./appears-on";
import type { Upstream } from "./config";
import { type UpdateCheck, VERSION } from "./health";
import { listening, madeForYou } from "./mixes";
import { type Groq, moodMixes } from "./mood-mixes";
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
}

type Context = { session: Session | null };

const accountOf = (session: Session) => `${session.server}:${session.user}`;

export function createRpc({ library, updates, groq, fetcher, upstreamFor, foldersFor }: RpcDeps) {
  const os = implement(contract).$context<Context>();
  const signedIn = os.use(({ context, next }) => {
    if (!context.session) throw new ORPCError("UNAUTHORIZED", { message: "signed out" });
    return next({ context: { session: context.session } });
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
      const made = madeForYou(library, session.server, account, { day: input.day, hour: input.hour, tzMinutes: input.tz });
      const heard = groq ? listening(library, session.server, account, Date.now()) : null;
      const moods = await moodMixes(library, groq, account, input.day, heard, fetcher);
      const weekly = await weeklyPlaylists(library, groq, account, input.day, heard, fetcher);
      return { day: input.day, mixes: [...made, ...moods, ...weekly] };
    }),
    artists: {
      appearsOn: signedIn.artists.appearsOn.handler(async ({ context, input }) => {
        const upstream = upstreamFor(context.session.server);
        if (!upstream) throw new ORPCError("UNAUTHORIZED", { message: "server removed from config" });
        return { albums: appearsOn(library, upstream.id, input.id, await foldersFor(context.session, upstream)) };
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
        specGenerateOptions: {
          info: {
            title: "keep music API",
            version: VERSION,
            description:
              "Everything the keep music player does, for your own integrations. Sign in with a token from the player " +
              "(settings → sync → connect) as `Authorization: Bearer <token>`. The player itself uses the same procedures over `/api/rpc`.",
          },
          components: { securitySchemes: { token: { type: "http", scheme: "bearer" } } },
          security: [{ token: [] }],
        },
      }),
    ],
  });
  const notFound = () => Response.json({ error: "no such procedure" }, { status: 404 });
  return {
    rpc: async (request: Request, session: Session | null): Promise<Response> => {
      const { matched, response } = await rpcHandler.handle(request, { prefix: "/api/rpc", context: { session } });
      return matched ? response : notFound();
    },
    http: async (request: Request, session: Session | null): Promise<Response> => {
      const { matched, response } = await httpHandler.handle(request, { prefix: "/api", context: { session } });
      return matched ? response : notFound();
    },
  };
}
