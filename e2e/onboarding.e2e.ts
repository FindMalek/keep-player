import { expect, test } from "./fixtures";

test("sign-in shows the server's health, a broken setup says what to fix", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("server-status")).toHaveText(/navidrome 0\.64\.2 · \d+ ms · opensubsonic/);

  await page.route("**/api/health", (route) =>
    route.fulfill({
      status: 503,
      json: {
        status: "degraded",
        version: "0.1.0",
        upstreams: [{ id: "default", reachable: false, latencyMs: null, server: null, openSubsonic: false }],
      },
    }),
  );
  await page.reload();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("can't reach navidrome");
  await expect(alert).toContainText("NAVIDROME_URL");
  await expect(alert.getByRole("link", { name: "setup guide" })).toBeVisible();
  // Fixed: checking again clears it.
  await page.unroute("**/api/health");
  await alert.getByRole("button", { name: "check again" }).click();
  await expect(page.getByTestId("server-status")).toBeVisible();
});

test("a wrong password is told apart, and the first sign-in walks through setup once", async ({ page }) => {
  // Undo the fixture's "already onboarded" for this test.
  await page.addInitScript(() => localStorage.removeItem("keep-player:onboarded"));
  await page.goto("/");
  await page.getByLabel("username").fill("demo");
  await page.getByLabel("password").fill("nope");
  await page.getByRole("button", { name: "sign in" }).click();
  await expect(page.getByText("wrong username or password")).toBeVisible();

  await page.getByLabel("password").fill("demo");
  await page.getByRole("button", { name: "sign in" }).click();
  const dialog = page.getByRole("dialog", { name: "welcome · make it yours" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "light" }).click();
  await expect(page.locator("html")).toHaveClass(/\blight\b/);
  await dialog.getByRole("button", { name: "5 GB" }).click();
  await dialog.getByRole("button", { name: "next" }).click();

  const tour = page.getByRole("dialog", { name: "three things worth knowing" });
  await expect(tour.getByText("search anything, even a line from a song's lyrics")).toBeVisible();
  await expect(tour.getByText("?", { exact: true })).toBeVisible();
  await tour.getByRole("button", { name: "start listening" }).click();
  await expect(tour).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("keep-player:onboarded"))).not.toBeNull();
});
