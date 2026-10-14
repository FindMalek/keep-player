import { createHash } from "node:crypto";

/** sha256 hashes of index.html's inline scripts, as CSP `script-src` sources. Bun leaves inline scripts verbatim. */
export function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (match) =>
      `'sha256-${createHash("sha256")
        .update(match[1] ?? "")
        .digest("base64")}'`,
  );
}

export function cspOf(html: string): string | undefined {
  return /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
}

// `bun scripts/csp.ts` prints the hash to paste into index.html after editing the inline boot script.
if (import.meta.main) console.log(inlineScriptHashes(await Bun.file("src/web/index.html").text()).join(" "));
