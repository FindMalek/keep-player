import index from "../../player/src/index.html";

/** Development: Bun bundles the app on the fly, with hot reload; the service worker is built per request, no shell. */
async function serviceWorker(): Promise<Response> {
  const result = await Bun.build({
    entrypoints: ["apps/player/src/sw.ts"],
    target: "browser",
    define: { __SHELL__: "[]", __VERSION__: '"dev"' },
  });
  const output = result.outputs[0];
  if (!output) return new Response("sw build failed", { status: 500 });
  return new Response(output, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" } });
}

export const webRoutes = { "/sw.js": serviceWorker, "/*": index };
