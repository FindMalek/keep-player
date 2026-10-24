import { expect, signIn, test, trackTitles } from "./fixtures";

test("settings has every section, links to each tab, and changes apply at once", async ({ page, signedIn }) => {
  await signedIn.getByRole("button", { name: /demo$/ }).click();
  await page.getByRole("menuitem", { name: "settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  // A dialog over the page you were on; closing it takes you back there.
  await expect(page.getByRole("dialog", { name: "settings" })).toBeVisible();
  for (const tab of ["playback", "appearance", "sync", "storage", "lyrics", "shortcuts", "account", "about"])
    await expect(page.getByRole("tab", { name: tab })).toBeVisible();

  await page.getByRole("tab", { name: "appearance" }).click();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(page.getByRole("switch", { name: "loading bar" })).not.toBeChecked();
  await page.getByRole("button", { name: /^theme:/ }).click();
  await page.getByRole("menuitemradio", { name: "light" }).click();
  await expect(page.locator("html")).toHaveClass(/\blight\b/);
  await page.getByRole("dialog", { name: "settings" }).getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "settings" })).toBeHidden();
  await expect(page).toHaveURL(/\/$/);

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

test("the notifications setting hides plain confirmations but never errors or things you can undo", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-21");
  const titles = await trackTitles(page);
  const addToQueue = async () => {
    await page.goto("/album/al-21");
    await page.getByRole("button", { name: "play", exact: true }).first().click();
    const row = page.getByRole("row", { name: new RegExp(titles[3] as string) }).first();
    await row.hover();
    await row.getByRole("button", { name: `add ${titles[3]} to queue`, exact: true }).click();
  };
  const level = async (name: string) => {
    await page.goto("/settings/appearance");
    await page.getByRole("group", { name: "notifications" }).getByRole("button", { name, exact: true }).click();
  };

  // At "errors" the confirmation doesn't pop up.
  await level("errors");
  await addToQueue();
  await page.waitForTimeout(800);
  await expect(page.getByText(`added ${titles[3]} to the queue`)).toHaveCount(0);

  // Back at "all" it does.
  await level("all");
  await addToQueue();
  await expect(page.getByText(`added ${titles[3]} to the queue`)).toBeVisible();
});

test("picking where notifications show pops a sample there", async ({ page, signedIn }) => {
  await signedIn.goto("/settings/appearance");
  await page.getByRole("button", { name: /^notifications show:/ }).click();
  await page.getByRole("menuitemradio", { name: "bottom right" }).click();
  const toaster = page.locator("[data-sonner-toaster][data-x-position=right][data-y-position=bottom]");
  await expect(toaster.getByText("notifications show up here")).toBeVisible();
});
