import { expect, test } from "./fixtures";

test.describe.configure({ mode: "serial" });

test("albums: sort, list view and genre filter, remembered after a reload", async ({ page, signedIn }) => {
  await signedIn.goto("/albums");
  await expect(page.locator("[data-grid-index]").first()).toBeVisible();

  await page.getByRole("combobox", { name: "sort albums" }).click();
  await page.getByRole("option", { name: "year" }).click();
  await page.getByRole("group", { name: "layout" }).getByLabel("list", { exact: true }).click();
  await expect(page.locator("[data-album-index]").first()).toBeVisible();
  const years = await page
    .locator("[data-album-index]")
    .evaluateAll((rows) => rows.slice(0, 8).map((row) => Number(row.querySelector("span:nth-of-type(3)")?.textContent ?? 0)));
  expect(years).toEqual([...years].sort((a, b) => b - a));

  await page.reload();
  await expect(page.getByRole("combobox", { name: "sort albums" })).toContainText("year");
  await expect(page.locator("[data-album-index]").first()).toBeVisible();

  await page.getByRole("combobox", { name: "genre" }).click();
  await page.getByRole("option").nth(1).click();
  await expect(page.getByRole("button", { name: "clear filters" })).toBeVisible();
  await expect(page.getByText(/^\d[\d,]* of \d[\d,]*$/)).toBeVisible();

  await page.getByRole("button", { name: "clear filters" }).click();
  await expect(page.getByRole("button", { name: "clear filters" })).toHaveCount(0);
  // leave the account's view as found
  await page.evaluate(() => localStorage.removeItem("keep-player:view:albums"));
});

test("artist page groups albums by release type and offers a radio", async ({ page, signedIn }) => {
  // al-1 is an EP; its artist page has an EPs section.
  await signedIn.goto("/album/al-1");
  await page.getByRole("link", { name: /./ }).filter({ hasText: /\d$/ }).first().waitFor();
  const artistHref = await page.locator('a[href^="/artist/"]').first().getAttribute("href");
  await signedIn.goto(artistHref ?? "/artists");
  await expect(page.getByRole("heading", { name: "EPs" })).toBeVisible();
  await expect(page.getByRole("button", { name: "radio" })).toBeVisible();
});

test("a two-disc album offers play from disc 2", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-5");
  await expect(page.getByRole("button", { name: "disc 2" })).toBeVisible();
  await page.getByRole("button", { name: "disc 2" }).click();
  await expect(page.getByRole("contentinfo").getByRole("link").first()).toBeVisible();
});

test("a genre page shows its top artists, popular songs and albums", async ({ page, signedIn }) => {
  await signedIn.goto("/genres");
  await page.locator('a[href^="/genre/"]').first().click();
  await expect(page.getByText("top artists", { exact: true })).toBeVisible();
  await expect(page.getByText("popular songs", { exact: true })).toBeVisible();
  await expect(page.getByText("albums", { exact: true }).first()).toBeVisible();
  await expect(page.locator('a[href^="/artist/"]').first()).toBeVisible();
});
