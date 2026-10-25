import { expect, test } from "./fixtures";

test("signs in, plays and opens an album in safari's engine", async ({ page, signedIn }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // In-app navigation: a full reload aborts the first page's lazy imports, which WebKit reports as a page error.
  await signedIn.getByRole("link", { name: "albums", exact: true }).click();
  await page.locator('a[href^="/album/"]').first().click();
  await page.getByRole("button", { name: "play", exact: true }).click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
  expect(errors).toEqual([]);
});
