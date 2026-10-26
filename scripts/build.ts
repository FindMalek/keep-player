import { rmSync } from "node:fs";
import { relative } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import tailwind from "bun-plugin-tailwind";

/*
 * 1. Bundle the web app (minified, code-split, hashed names) into dist/web and precompress every file (brotli + gzip).
 * 2. Generate apps/api/src/assets.generated.ts, which imports each file `with { type: "file" }` so it gets embedded.
 * 3. Compile the server into one executable, then restore the empty manifest so the working tree stays clean.
 */
const OUT = "dist/web";
const MANIFEST = "apps/api/src/assets.generated.ts";
const define = { "process.env.NODE_ENV": '"production"' };

function fail(logs: unknown[]): never {
  for (const log of logs) console.error(log);
  process.exit(1);
}

rmSync("dist", { recursive: true, force: true });
const web = await Bun.build({
  entrypoints: ["apps/player/src/index.html"],
  outdir: OUT,
  minify: true,
  splitting: true,
  publicPath: "/",
  plugins: [tailwind],
  define,
});
if (!web.success) fail(web.logs);

// The service worker, with the shell (index + hashed files + the two preloaded fonts) it should keep for offline.
const shell = [
  "/",
  ...web.outputs.map((output) => `/${relative(OUT, output.path)}`).filter((url) => /\.(js|css)$/.test(url)),
  "/fonts/ibm-plex-sans-latin.woff2",
  "/fonts/jetbrains-mono-latin.woff2",
];
const worker = await Bun.build({
  entrypoints: ["apps/player/src/sw.ts"],
  outdir: OUT,
  naming: "sw.js",
  minify: true,
  target: "browser",
  define: { __SHELL__: JSON.stringify(shell), __VERSION__: JSON.stringify(Bun.hash(shell.join()).toString(36)) },
});
if (!worker.success) fail(worker.logs);

const TYPES: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  html: "text/html; charset=utf-8",
};
const entries: string[] = [];
const imports: string[] = [];
for (const [index, output] of [...web.outputs, ...worker.outputs].entries()) {
  const extension = output.path.split(".").pop() ?? "";
  if (!TYPES[extension]) continue;
  const bytes = new Uint8Array(await output.arrayBuffer());
  await Bun.write(`${output.path}.br`, brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
  await Bun.write(`${output.path}.gz`, gzipSync(bytes, { level: 9 }));
  const file = relative("apps/api/src", output.path);
  imports.push(
    `import a${index} from "${file}" with { type: "file" };`,
    `import a${index}br from "${file}.br" with { type: "file" };`,
    `import a${index}gz from "${file}.gz" with { type: "file" };`,
  );
  entries.push(`  "/${relative(OUT, output.path)}": { path: a${index}, br: a${index}br, gzip: a${index}gz, type: "${TYPES[extension]}" },`);
}

const empty = await Bun.file(MANIFEST).text();
await Bun.write(
  MANIFEST,
  `${imports.join("\n")}\nimport type { Asset } from "./asset";\n\nexport const ASSETS: Record<string, Asset> = {\n${entries.join("\n")}\n};\n`,
);
try {
  const server = await Bun.build({
    entrypoints: ["apps/api/src/server.ts"],
    // BUN_TARGET (e.g. bun-linux-arm64-musl) cross-compiles: the image builds every architecture on the CI's own CPU.
    compile: {
      outfile: "dist/keep-player",
      ...(process.env.BUN_TARGET ? { target: process.env.BUN_TARGET as Bun.Build.CompileTarget } : {}),
    },
    target: "bun",
    minify: true,
    define,
  });
  if (!server.success) fail(server.logs);
} finally {
  await Bun.write(MANIFEST, empty);
}
console.log(`built dist/keep-player (${entries.length} embedded assets)`);
