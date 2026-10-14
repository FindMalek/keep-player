import { expect, test, trackTitles } from "./fixtures";

test("adding to the queue says so, and undo takes exactly that back out", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-21");
  const titles = await trackTitles(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  const row = page.getByRole("row", { name: new RegExp(titles[3] as string) }).first();
  await row.hover();
  await row.getByRole("button", { name: `add ${titles[3]} to queue`, exact: true }).click();
  await expect(page.getByText(`added ${titles[3]} to the queue`)).toBeVisible();
  await page.locator("body").press("q");
  const queue = page.getByRole("complementary", { name: "queue" });
  await expect(queue.getByText("next in your queue")).toBeVisible();
  await page.getByRole("button", { name: "undo" }).click();
  await expect(queue.getByText("next in your queue")).toHaveCount(0);
});

test("the clicked album's cover carries into its page, and reduce motion turns transitions off", async ({ page, signedIn }) => {
  await signedIn.goto("/albums");
  const card = page
    .getByRole("main")
    .getByRole("link")
    .filter({ has: page.locator("img") })
    .nth(2);
  await card.click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const named = page.locator("main header > div").first();
  await expect(named).toHaveCSS("view-transition-name", "album-cover");

  await page.getByRole("button", { name: /demo$/ }).click();
  await page.getByRole("menuitemcheckbox", { name: "reduce motion" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
});
