import { gzipSync } from "node:zlib";

/** Fails when the production bundle grows past the budget (gzipped KB). Tighten as the app gets faster, never loosen silently. */
const BUDGET_KB = { js: 200, css: 40 };

const result = await Bun.build({ entrypoints: ["src/web/index.html"], minify: true, define: { "process.env.NODE_ENV": '"production"' } });
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const totals = { js: 0, css: 0 };
for (const output of result.outputs) {
  const kind = output.path.endsWith(".css") ? "css" : output.path.endsWith(".js") ? "js" : null;
  if (kind) totals[kind] += gzipSync(new Uint8Array(await output.arrayBuffer())).length / 1024;
}

let failed = false;
for (const kind of ["js", "css"] as const) {
  const over = totals[kind] > BUDGET_KB[kind];
  failed ||= over;
  console.log(`${kind}: ${totals[kind].toFixed(1)} KB gzip (budget ${BUDGET_KB[kind]} KB)${over ? "  OVER BUDGET" : ""}`);
}
process.exit(failed ? 1 : 0);
