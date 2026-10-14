import { expect, fakeMediaClock, test } from "./fixtures";

const playingCount = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __playingMedia: () => number }).__playingMedia());

test.beforeEach(async ({ page }) => {
  await page.addInitScript(fakeMediaClock);
});

test("near the end of a track the preloaded next one takes over, and only one plays", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const titles = await page.locator("[aria-label=tracks] tbody tr td:nth-child(2) span:first-child").allTextContents();
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  const bar = page.getByRole("contentinfo");
  await expect(bar.getByRole("link", { name: titles[0] as string })).toBeVisible();
  // Click the seek bar right at its end; the handover is timed off the playing element's clock.
  const seek = page.locator("[data-slot=audio-player-seek]");
  const box = await seek.boundingBox();
  if (!box) throw new Error("no seek bar");
  await page.mouse.click(box.x + box.width - 3, box.y + box.height / 2);
  await expect(bar.getByRole("link", { name: titles[1] as string })).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(300);
  expect(await playingCount(page)).toBe(1);
});

test("rapid next and previous land on the right track with one deck playing", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const titles = await page.locator("[aria-label=tracks] tbody tr td:nth-child(2) span:first-child").allTextContents();
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  for (let i = 0; i < 6; i += 1) await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowLeft");
  const bar = page.getByRole("contentinfo");
  await expect(bar.getByRole("link", { name: titles[5] as string })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await playingCount(page)).toBe(1);
});
