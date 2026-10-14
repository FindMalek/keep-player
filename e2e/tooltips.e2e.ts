import { expect, test, trackTitles } from "./fixtures";

test("icon buttons explain themselves with their shortcut and state", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const titles = await trackTitles(page);
  const row = page.getByRole("row", { name: titles[1] as string }).first();
  await row.hover();
  await row.getByRole("button", { name: `play ${titles[1]} next`, exact: true }).hover();
  await expect(page.locator("[data-slot=tooltip-content]").filter({ hasText: "play next" })).toContainText("⇧");

  await page.getByRole("button", { name: "play", exact: true }).first().click();
  const bar = page.getByRole("contentinfo");
  await bar.getByRole("button", { name: "repeat off" }).hover();
  await expect(page.locator("[data-slot=tooltip-content]").filter({ hasText: "repeat: off" })).toBeVisible();
  await bar.getByRole("button", { name: /^(un)?mute$/i }).hover();
  await expect(page.locator("[data-slot=tooltip-content]").filter({ hasText: /volume \d+%/ })).toBeVisible();
});

test("hovering the playing cover shows the album, file and gain; an artist link previews the artist", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  const bar = page.getByRole("contentinfo");
  await bar.locator("img").first().hover();
  const card = page.locator("[data-slot=hover-card-content]");
  await expect(card).toContainText("gain");
  await expect(card).toContainText(/dB \((album|track)\)/);
  await expect(card).toContainText("MP3");

  await page.mouse.move(0, 0);
  await expect(card).toHaveCount(0);
  const artist = page.getByRole("main").locator("header").getByRole("link").first();
  const name = (await artist.textContent()) as string;
  await artist.hover();
  await expect(page.locator("[data-slot=hover-card-content]")).toContainText(name);
});
