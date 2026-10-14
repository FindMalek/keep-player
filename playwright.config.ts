import { defineConfig, devices } from "@playwright/test";

const APP = 4580;
const MOCK = 4599;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${APP}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: "bun test/mock/server.ts",
      url: `http://127.0.0.1:${MOCK}/rest/ping`,
      env: { MOCK_PORT: String(MOCK) },
      reuseExistingServer: !process.env.CI,
    },
    {
      // The real artifact: the compiled executable with the bundled, minified, code-split app.
      command: "bun scripts/build.ts && ./dist/keep-player",
      url: `http://127.0.0.1:${APP}/healthz`,
      env: { PORT: String(APP), NAVIDROME_URL: `http://127.0.0.1:${MOCK}` },
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
