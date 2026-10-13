import { expect, test } from "./fixtures";

test("wrong password shows an error and stays on login", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("username").fill("demo");
  await page.getByLabel("password").fill("nope");
  await page.getByRole("button", { name: "sign in" }).click();
  await expect(page.getByText("wrong username or password")).toBeVisible();
});

test("plays an album and space toggles pause", async ({ signedIn: page }) => {
  await page.goto("/albums");
  await page.locator('a[href^="/album/"]').first().click();
  await page.getByRole("button", { name: "play", exact: true }).click();
  const bar = page.getByRole("contentinfo");
  await expect(bar.getByRole("button", { name: "pause" })).toBeVisible();
  await page.locator("body").press("Space");
  await expect(bar.getByRole("button", { name: "play", exact: true })).toBeVisible();
});
