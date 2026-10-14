import plexLatinExt from "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-ext-wght-normal.woff2" with { type: "file" };
import plexLatin from "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2" with { type: "file" };
import monoLatinExt from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2" with { type: "file" };
import monoLatin from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2" with { type: "file" };

/** Font files embedded in the executable, served at stable URLs so index.html can preload them. */
const FONTS: Record<string, string> = {
  "ibm-plex-sans-latin.woff2": plexLatin,
  "ibm-plex-sans-latin-ext.woff2": plexLatinExt,
  "jetbrains-mono-latin.woff2": monoLatin,
  "jetbrains-mono-latin-ext.woff2": monoLatinExt,
};

export function font(request: Request & { params: { name: string } }): Response {
  const path = FONTS[request.params.name];
  if (!path) return new Response("not found", { status: 404 });
  return new Response(Bun.file(path), { headers: { "content-type": "font/woff2", "cache-control": "public, max-age=2592000" } });
}
