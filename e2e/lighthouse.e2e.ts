import { chromium, expect, test } from "@playwright/test";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const PORT = 9333;
/** Single Lighthouse runs swing by several points on shared CI machines; the median of three is what's judged. */
const RUNS = 3;
// The floor: GitHub runners land the same code on 0.94 or 0.95 depending on the machine, so 0.95 failed
// unrelated changes. A real regression moves the median by several points.
const FLOOR = 0.93;

test("home scores ≥ 93 on Lighthouse performance (desktop, 10k-track fixture, median of 3)", async ({ baseURL }) => {
  test.setTimeout(240_000);
  const login = await fetch(`${baseURL}/auth/login`, {
    method: "POST",
    headers: { "x-lodesong": "1", "content-type": "application/json" },
    body: JSON.stringify({ user: "demo", password: "demo" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
  const scores: number[] = [];
  try {
    for (let run = 0; run < RUNS; run += 1) {
      const result = await lighthouse(
        `${baseURL}/`,
        { port: PORT, output: "json", logLevel: "error", onlyCategories: ["performance"], extraHeaders: { cookie } },
        desktopConfig,
      );
      const audits = result?.lhr.audits ?? {};
      scores.push(result?.lhr.categories.performance?.score ?? 0);
      console.log(
        [
          `score ${scores.at(-1)}`,
          ...["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index"].map(
            (id) => `${id} ${audits[id]?.displayValue ?? "?"}`,
          ),
        ].join(" · "),
      );
      const shifts =
        (audits["layout-shifts"]?.details as { items?: { node?: { selector?: string; snippet?: string }; score?: number }[] } | undefined)
          ?.items ?? [];
      for (const shift of shifts)
        console.log(`layout shift ${shift.score?.toFixed(3)}: ${shift.node?.selector ?? "?"} ${shift.node?.snippet?.slice(0, 120) ?? ""}`);
    }
  } finally {
    await browser.close();
  }
  const median = [...scores].sort((a, b) => a - b)[Math.floor(RUNS / 2)] ?? 0;
  expect(median).toBeGreaterThanOrEqual(FLOOR);
});
