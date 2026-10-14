import { expect, test } from "./fixtures";

test("back restores where the page was scrolled", async ({ page, signedIn }) => {
  await signedIn.goto("/songs");
  const scroller = page.locator("[data-page-scroll]");
  await expect(page.getByRole("grid", { name: "tracks" })).toBeVisible();
  await scroller.evaluate((element) => element.scrollTo(0, 2400));
  await page.waitForTimeout(100);
  // Click a link that's already on screen; a locator click would scroll the page to the first match.
  await page.evaluate(() => {
    const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/album/"]')];
    links.find((link) => link.getBoundingClientRect().top > 200)?.click();
  });
  await expect(page).toHaveURL(/\/album\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/songs$/);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(2300);
});
