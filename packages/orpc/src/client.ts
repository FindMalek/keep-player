import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { Contract } from "./contract";

export type KeepClient = ContractRouterClient<Contract>;

/** A typed client for `/api/rpc`; `headers` carries the CSRF header every call needs. `fetch` stands in for tests. */
export function createKeepClient(
  url: string,
  headers: Record<string, string>,
  fetcher?: (request: Request) => Promise<Response>,
): KeepClient {
  return createORPCClient(new RPCLink({ url, headers, ...(fetcher ? { fetch: (request: Request) => fetcher(request) } : {}) }));
}
