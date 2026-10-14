import { expect, test } from "bun:test";
import { cspOf, inlineScriptHashes } from "./csp";

test("the CSP allows exactly index.html's inline scripts (rerun `bun scripts/csp.ts` after editing them)", async () => {
  const html = await Bun.file("src/web/index.html").text();
  const scriptSrc =
    cspOf(html)
      ?.split(";")
      .find((directive) => directive.trim().startsWith("script-src")) ?? "";
  expect(Array.from(scriptSrc.matchAll(/'sha256-[^']+'/g), (match) => match[0])).toEqual(inlineScriptHashes(html));
});
