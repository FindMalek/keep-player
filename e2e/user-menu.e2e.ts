import { expect, test } from "./fixtures";

test("the menu is short: the quick settings and the way out", async ({ page, signedIn }) => {
  await signedIn.getByRole("button", { name: /demo$/ }).click();
  const items = await page.getByRole("menuitem").allInnerTexts();
  expect(items.map((item) => item.replace(/\s+/g, " ").trim().replace(/ \?$/, ""))).toEqual([
    "keyboard shortcuts",
    "settings",
    "listen together",
    "log out",
  ]);
});

test("the user menu opens and switches the theme", async ({ page, signedIn }) => {
  await signedIn.getByRole("button", { name: /demo$/ }).click();
  await page.getByRole("menuitemradio", { name: "light" }).click();
  await expect(page.locator("html")).toHaveClass(/\blight\b/);
});

test("an admin finds the library index in settings and can rebuild it", async ({ page, signedIn }) => {
  await signedIn.goto("/settings/account");
  await expect(page.getByText("library index", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "manage" }).first().click();
  const dialog = page.getByRole("dialog", { name: "library index" });
  await dialog.getByRole("button", { name: "rebuild now" }).click();
  await expect(dialog.getByText("10,000")).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole("button", { name: "rebuild now" })).toBeEnabled();
});

test("the menu shows the running version, and the server reports Navidrome's health without signing in", async ({ page, signedIn }) => {
  await signedIn.getByRole("button", { name: /demo$/ }).click();
  await expect(page.getByText(/^lodesong v\d+\.\d+\.\d+$/)).toBeVisible();
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: "ok", upstreams: [{ id: "default", reachable: true }] });
});
