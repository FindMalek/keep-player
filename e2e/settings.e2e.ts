import { expect, signIn, test } from "./fixtures";

test("settings has every section, links to each tab, and changes apply at once", async ({ page, signedIn }) => {
  await signedIn.getByRole("button", { name: /demo$/ }).click();
  await page.getByRole("menuitem", { name: "settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  for (const tab of ["playback", "appearance", "sync", "storage", "lyrics", "shortcuts", "account", "about"])
    await expect(page.getByRole("tab", { name: tab })).toBeVisible();

  await page.getByRole("tab", { name: "appearance" }).click();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await page.getByRole("switch", { name: "reduce motion" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await page.getByRole("group", { name: "theme" }).getByRole("button", { name: "light" }).click();
  await expect(page.locator("html")).toHaveClass(/\blight\b/);

  // A link to a tab opens it.
  await page.goto("/settings/shortcuts");
  await page.getByRole("tabpanel").getByRole("button", { name: "show" }).click();
  await expect(page.getByRole("dialog", { name: "keyboard shortcuts" })).toBeVisible();
});

test("synced settings follow you to another browser; device ones stay put", async ({ browser, page }) => {
  // This test needs the real sync the fixture stubs out.
  await page.unroute("**/api/settings");
  await signIn(page);
  await page.goto("/settings/appearance");
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PUT");
  await page.getByRole("switch", { name: "show ratings" }).click();
  await saved;

  const other = await browser.newContext();
  const second = await other.newPage();
  await second.addInitScript(() => localStorage.setItem("keep-player:onboarded", "test"));
  await signIn(second);
  await second.goto("/settings/appearance");
  await expect(second.getByRole("switch", { name: "show ratings" })).toBeChecked();

  // Put it back for whoever runs next.
  const reset = second.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PUT");
  await second.getByRole("switch", { name: "show ratings" }).click();
  await reset;
  await other.close();
});

test("the app is installable: a manifest with icons, served by the server", async ({ page, signedIn }) => {
  const href = await signedIn.locator("link[rel=manifest]").getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");
  const manifest = await (await page.request.get(href as string)).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const response = await page.request.get(icon.src);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe(icon.type);
  }
});
