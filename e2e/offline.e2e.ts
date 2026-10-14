import { expect, fakeMediaClock, test, trackTitles } from "./fixtures";

test("once the next tracks are precached, going offline still plays and seeks them", async ({ page, context, signedIn }) => {
  await page.addInitScript(fakeMediaClock);
  await signedIn.goto("/album/al-3");
  // The service worker controls the page from its first load on.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const titles = await trackTitles(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await expect(page.locator("[aria-label=tracks]").getByLabel("saved for offline")).toHaveCount(3, { timeout: 15_000 });

  await context.setOffline(true);
  const bar = page.getByRole("contentinfo");
  for (const title of titles.slice(1, 4)) {
    await page.keyboard.press("Shift+ArrowRight");
    await expect(bar.getByRole("link", { name: title as string })).toBeVisible();
  }
  const seek = page.locator("[data-slot=audio-player-seek]");
  const box = await seek.boundingBox();
  if (!box) throw new Error("no seek bar");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(1500);
  await expect(bar.getByRole("button", { name: "retry" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "pause" })).toBeVisible();
  expect(await page.locator("[data-slot=audio-player-time][data-type=current]").textContent()).not.toBe("0:00");
});
