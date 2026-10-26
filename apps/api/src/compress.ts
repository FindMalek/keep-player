import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

// Audio, covers and fonts are already compressed; event streams must not be buffered.
const COMPRESSIBLE = /^(application\/(json|xml|javascript)|text\/(?!event-stream))/;
const MIN_BYTES = 1024;
// Quality 5: about gzip's speed with most of brotli's gain; 11 costs ~100 ms on a 1 MB song list.
const BROTLI_OPTIONS = { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } };

export async function compress(request: Request, response: Response | undefined): Promise<Response | undefined> {
  if (!response?.body || response.headers.has("content-encoding") || response.status === 206) return response;
  if (!COMPRESSIBLE.test(response.headers.get("content-type") ?? "")) return response;
  const accepted = request.headers.get("accept-encoding") ?? "";
  const encoding = /\bbr\b/.test(accepted) ? "br" : /\bgzip\b/.test(accepted) ? "gzip" : null;
  if (!encoding) return response;
  const body = new Uint8Array(await response.arrayBuffer());
  const headers = new Headers(response.headers);
  headers.append("vary", "accept-encoding");
  const init = { status: response.status, statusText: response.statusText, headers };
  if (body.byteLength < MIN_BYTES) return new Response(body, init);
  headers.set("content-encoding", encoding);
  headers.delete("content-length");
  return new Response(encoding === "br" ? await brotli(body, BROTLI_OPTIONS) : await gzipAsync(body), init);
}

const isMethods = (route: object) => {
  const keys = Object.keys(route);
  return keys.length > 0 && keys.every((key) => /^[A-Z]+$/.test(key));
};

type Handler = (request: Request, server: Bun.Server<unknown>) => Response | undefined | Promise<Response | undefined>;

export function compressed<T extends Record<string, unknown>>(routes: T): T {
  const wrap =
    (handler: Handler): Handler =>
    async (request, server) =>
      compress(request, await handler(request, server));
  const out: Record<string, unknown> = {};
  for (const [path, route] of Object.entries(routes)) {
    if (typeof route === "function") out[path] = wrap(route as Handler);
    // An HTMLBundle (dev) has no own keys: only an object of method handlers is wrapped.
    else if (route && typeof route === "object" && !(route instanceof Response) && isMethods(route))
      out[path] = Object.fromEntries(Object.entries(route).map(([method, handler]) => [method, wrap(handler as Handler)]));
    else out[path] = route;
  }
  return out as T;
}
