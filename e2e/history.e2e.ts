import { expect, fakeMediaClock, test, trackTitles } from "./fixtures";

test("what you play lands in history by day, a quick skip says so, and a day plays again", async ({ page, signedIn }) => {
  await page.addInitScript(fakeMediaClock);
  await signedIn.goto("/album/al-25");
  const titles = await trackTitles(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.waitForTimeout(3500);
  // Gone after a few seconds: a skip.
  await page.locator("body").press("n");
  await page.waitForTimeout(500);
  await page.locator("body").press("g");
  await page.locator("body").press("p");
  await expect(page).toHaveURL(/\/history$/);
  const today = page
    .getByRole("main")
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: /^today · / }) });
  await expect(today.getByRole("heading")).toContainText("skipped");
  await expect(today.getByRole("row", { name: titles[0] as string }).first()).toBeVisible();
  await today.getByRole("button", { name: "play again" }).click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
});
