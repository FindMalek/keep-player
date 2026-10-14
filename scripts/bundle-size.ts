import { gzipSync } from "node:zlib";
import tailwind from "bun-plugin-tailwind";

/**
 * Fails when the JS and CSS the first screen needs grow past the budget (gzipped KB). Lazy chunks (⌘K, later pages)
 * are reported but not budgeted. Tighten as the app gets faster, never loosen without saying why in the PR.
 */
// React DOM alone is ~62 KB, TanStack Query + its IndexedDB persistence ~13 KB (#18), the playback engine (queue model,
// two-deck gapless, resilience) a few more; the rest is Base UI (sidebar tooltips need floating-ui on the first screen)
// and the app. Lighthouse ≥ 95 (e2e/lighthouse.e2e.ts) is the real gate.
const BUDGET_KB = { js: 180, css: 30 };

const result = await Bun.build({
  entrypoints: ["src/web/index.html"],
  minify: true,
  splitting: true,
  metafile: true,
  plugins: [tailwind],
  define: { "process.env.NODE_ENV": '"production"' },
});
if (!result.success || !result.metafile) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const name = (path: string) => path.replace(/^\.\//, "").split("/").pop() ?? path;
const outputs = result.metafile.outputs;
const html = await result.outputs.find((output) => output.path.endsWith(".html"))?.text();
// The first screen loads what index.html references plus everything those chunks import statically.
const initial = new Set([...(html ?? "").matchAll(/(?:src|href)="\/?([^"]+\.(?:js|css))"/g)].map((match) => name(match[1] as string)));
for (const chunk of [...initial]) {
  const queue = [chunk];
  while (queue.length) {
    const current = queue.pop() as string;
    const entry = Object.entries(outputs).find(([path]) => name(path) === current)?.[1];
    for (const item of entry?.imports ?? []) {
      if (item.kind !== "import-statement" || initial.has(name(item.path))) continue;
      initial.add(name(item.path));
      queue.push(name(item.path));
    }
  }
}

const totals = { js: 0, css: 0, lazy: 0 };
for (const output of result.outputs) {
  const kind = output.path.endsWith(".css") ? "css" : output.path.endsWith(".js") ? "js" : null;
  if (!kind) continue;
  const size = gzipSync(new Uint8Array(await output.arrayBuffer())).length / 1024;
  if (initial.has(name(output.path))) totals[kind] += size;
  else totals.lazy += size;
}

let failed = false;
for (const kind of ["js", "css"] as const) {
  const over = totals[kind] > BUDGET_KB[kind];
  failed ||= over;
  console.log(`first screen ${kind}: ${totals[kind].toFixed(1)} KB gzip (budget ${BUDGET_KB[kind]} KB)${over ? "  OVER BUDGET" : ""}`);
}
console.log(`lazy chunks: ${totals.lazy.toFixed(1)} KB gzip`);
process.exit(failed ? 1 : 0);
