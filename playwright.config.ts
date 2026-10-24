import { defineConfig, devices } from "@playwright/test";

// Runners sharing one host run e2e side by side: each gets its own ports (E2E_PORT_OFFSET, set per runner in CI).
const OFFSET = Number(process.env.E2E_PORT_OFFSET ?? 0);
const APP = 4580 + OFFSET;
const MOCK = 4599 + OFFSET;
// Tests that call the mock directly read it from here (workers inherit the env).
process.env.E2E_MOCK_URL = `http://127.0.0.1:${MOCK}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${APP}`, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", testIgnore: /lighthouse/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // Alone and last: a busy CPU from parallel tests would skew the score.
    { name: "lighthouse", testMatch: /lighthouse/, dependencies: ["chromium"] },
  ],
  webServer: [
    {
      command: "bun test/mock/server.ts",
      url: `http://127.0.0.1:${MOCK}/rest/ping`,
      env: { MOCK_PORT: String(MOCK) },
    },
    {
      // The real artifact: the compiled executable with the bundled, minified, code-split app.
      command: "bun scripts/build.ts && ./dist/keep-player",
      url: `http://127.0.0.1:${APP}/healthz`,
      env: {
        PORT: String(APP),
        NAVIDROME_URL: `http://127.0.0.1:${MOCK}`,
        DATA_DIR: "test-results/data",
        UPLOAD_DIR: `${process.cwd()}/test-results/uploads`,
        // Every test signs in as the same user: one shared session would have their tabs take over from each other.
        ONE_SESSION: "off",
        GROQ_API_KEY: "e2e-groq-key",
        GROQ_URL: `http://127.0.0.1:${MOCK}/groq`,
        LYTERION_URL: `http://127.0.0.1:${MOCK}/lyterion`,
        LYTERION_TOKEN: "e2e-lyterion-token-0123456789",
        LRCLIB_URL: `http://127.0.0.1:${MOCK}/lrclib`,
        LYRICS_BACKFILL: "off",
      },
      timeout: 120_000,
    },
  ],
});
