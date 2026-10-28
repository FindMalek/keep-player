import { createKeepClient } from "@lodesong/orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { HEADERS } from "./subsonic";

/** The API's oRPC procedures, typed by `@lodesong/orpc`'s contract; `rpc.x.queryOptions(…)` for TanStack Query. */
const client = createKeepClient(`${location.origin}/api/rpc`, HEADERS);
export const rpc = createTanstackQueryUtils(client);
