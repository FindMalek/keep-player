import { expect, fakeMediaClock, test, trackTitles } from "./fixtures";

const playingCount = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __playingMedia: () => number }).__playingMedia());

test.beforeEach(async ({ page }) => {
  await page.addInitScript(fakeMediaClock);
  await page.addInitScript(() => localStorage.setItem("keep-player:settings", JSON.stringify({ crossfade: 6 })));
});

/** Click the seek bar so `left` seconds of the song remain (the preloaded next song needs a moment to be ready). */
async function jumpToNearEnd(page: import("@playwright/test").Page, left: number) {
  const seek = page.locator("[data-slot=audio-player-seek]");
  const slider = seek.getByRole("slider");
  // "0:03 of 4:14"
  const length = async () => {
    const [minutes = 0, seconds = 0] = ((await slider.getAttribute("aria-valuetext"))?.split(" of ")[1] ?? "0:0").split(":").map(Number);
    return minutes * 60 + seconds;
  };
  await expect.poll(length).toBeGreaterThan(1);
  const duration = await length();
  const box = await seek.boundingBox();
  if (!box) throw new Error("no seek bar");
  await page.mouse.click(box.x + box.width * (1 - left / duration), box.y + box.height / 2);
}

test("between songs that don't follow each other on an album, the two play together while one fades into the other", async ({
  page,
  signedIn,
}) => {
  await signedIn.goto("/album/al-3");
  const titles = await trackTitles(page);
  // Track 8 up next: not the album's next track, so it fades in.
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  const rows = page.locator("[aria-label=tracks] tbody tr[data-song-index]");
  await rows.nth(7).focus();
  await page.keyboard.press("x");
  await page.keyboard.press("a");
  await page.keyboard.press("Escape");
  await jumpToNearEnd(page, 9);
  const bar = page.getByRole("contentinfo");
  await expect(bar.getByRole("link", { name: titles[7] as string })).toBeVisible({ timeout: 8000 });
  expect(await playingCount(page)).toBe(2);
  await expect.poll(() => playingCount(page), { timeout: 8000 }).toBe(1);
});

test("tracks of one album in order stay gapless: no overlap", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const titles = await trackTitles(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await jumpToNearEnd(page, 9);
  const bar = page.getByRole("contentinfo");
  await expect(bar.getByRole("link", { name: titles[1] as string })).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(300);
  expect(await playingCount(page)).toBe(1);
});

test("the crossfade slider sets the setting", async ({ page, signedIn }) => {
  await signedIn.goto("/settings/playback");
  const slider = page.getByRole("slider", { name: "crossfade seconds" });
  await expect(slider).toBeVisible();
  await expect(page.getByText("6 s")).toBeVisible();
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(page.getByText("off", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("keep-player:settings") ?? "{}").crossfade)).toBe(0);
});
