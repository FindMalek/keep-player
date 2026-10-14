import type { Asset } from "./asset";
import { ASSETS } from "./assets.generated";

/*
 * Production: the prebuilt app, embedded in the executable. Hashed assets are immutable; brotli or gzip versions were
 * compressed at build time and are picked by Accept-Encoding. index.html is never cached, so a deploy shows at once.
 */
const PAGE_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), geolocation=(), payment=(), usb=(), microphone=(self), speaker-selection=(self)",
};

function encoded(request: Request, asset: Asset): { file: string; encoding?: string } {
  const accepted = request.headers.get("accept-encoding") ?? "";
  if (asset.br && /\bbr\b/.test(accepted)) return { file: asset.br, encoding: "br" };
  if (asset.gzip && /\bgzip\b/.test(accepted)) return { file: asset.gzip, encoding: "gzip" };
  return { file: asset.path };
}

function serve(request: Request, asset: Asset, headers: Record<string, string>): Response {
  const { file, encoding } = encoded(request, asset);
  return new Response(Bun.file(file), {
    headers: { "content-type": asset.type, vary: "accept-encoding", ...(encoding ? { "content-encoding": encoding } : {}), ...headers },
  });
}

const page = ASSETS["/index.html"];
const html = page ? await Bun.file(page.path).text() : "";
// The page's CSP lives in a <meta> (so dev has it too); as a header it can also forbid framing.
const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
const etag = `"${Bun.hash(html).toString(36)}"`;

function index(request: Request): Response {
  if (!page) return new Response("app not built", { status: 500 });
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
  return serve(request, page, {
    ...PAGE_HEADERS,
    ...(csp ? { "content-security-policy": `${csp}; frame-ancestors 'none'` } : {}),
    "cache-control": "no-cache",
    etag,
  });
}

export const webRoutes = {
  ...Object.fromEntries(
    Object.entries(ASSETS)
      .filter(([url]) => url !== "/index.html")
      .map(([url, asset]) => [
        url,
        (request: Request) => serve(request, asset, { "cache-control": "public, max-age=31536000, immutable" }),
      ]),
  ),
  "/*": index,
} as Record<string, (request: Request) => Response> & Record<"/*" | "/sw.js", (request: Request) => Response>;
