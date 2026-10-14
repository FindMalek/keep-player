import { expect, test } from "./fixtures";

test("10k songs: only on-screen rows exist, more pages load while scrolling", async ({ page, signedIn }) => {
  await signedIn.goto("/songs");
  await expect(page.getByText("10,000 songs")).toBeVisible();
  const rows = page.locator("[aria-label=tracks] tbody tr[data-index]");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(60);

  const scroller = page.locator("[data-page-scroll]");
  // Scroll in steps; each page of 200 loads once the reader is 80% down what's loaded.
  for (let step = 0; step < 6; step += 1) {
    await scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await page.waitForTimeout(150);
  }
  await expect
    .poll(() => page.locator("[aria-label=tracks] tbody tr[data-index]").last().getAttribute("data-index").then(Number))
    .toBeGreaterThan(1000);
  expect(await rows.count()).toBeLessThanOrEqual(60);
});

test("albums grid renders a window of cards and the A–Z bar jumps on the artists page", async ({ page, signedIn }) => {
  await signedIn.goto("/albums");
  await expect(page.locator('a[href^="/album/"]').first()).toBeVisible();
  expect(await page.locator('a[href^="/album/"]').count()).toBeLessThanOrEqual(120);

  await page.goto("/artists");
  const nav = page.getByRole("navigation", { name: "jump to letter" });
  const last = nav.getByRole("button").last();
  const letter = (await last.textContent()) ?? "";
  await last.click();
  await expect(page.getByRole("heading", { name: letter, exact: true })).toBeInViewport();
});
