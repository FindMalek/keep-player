import { createKeepClient } from "@keep/orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { HEADERS } from "./subsonic";

/** The API's oRPC procedures, typed by `@keep/orpc`'s contract; `rpc.x.queryOptions(…)` for TanStack Query. */
export const client = createKeepClient(`${location.origin}/api/rpc`, HEADERS);
export const rpc = createTanstackQueryUtils(client);
