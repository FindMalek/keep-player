import { chromium, expect, test } from "@playwright/test";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const PORT = 9333;

test("home scores ≥ 95 on Lighthouse performance (desktop, 10k-track fixture)", async ({ baseURL }) => {
  test.setTimeout(120_000);
  const login = await fetch(`${baseURL}/auth/login`, {
    method: "POST",
    headers: { "x-keep-player": "1", "content-type": "application/json" },
    body: JSON.stringify({ user: "demo", password: "demo" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
  try {
    const result = await lighthouse(
      `${baseURL}/`,
      { port: PORT, output: "json", logLevel: "error", onlyCategories: ["performance"], extraHeaders: { cookie } },
      desktopConfig,
    );
    const audits = result?.lhr.audits ?? {};
    console.log(
      ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index"]
        .map((id) => `${id} ${audits[id]?.displayValue ?? "?"}`)
        .join(" · "),
    );
    expect(result?.lhr.categories.performance?.score ?? 0).toBeGreaterThanOrEqual(0.95);
  } finally {
    await browser.close();
  }
});
