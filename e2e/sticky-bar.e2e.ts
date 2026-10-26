import { expect, test } from "./fixtures";

test("a long playlist keeps its name, play, search and sort in a bar once the header scrolls away", async ({ page, signedIn }) => {
  await signedIn.goto("/playlist/pl-3");
  const bar = page.locator("[data-sticky-bar]");
  await expect(page.getByRole("grid", { name: "tracks" })).toBeVisible();
  await expect(bar).toHaveAttribute("aria-hidden", "true");

  const scrollDown = async () => {
    await page.locator("[data-page-scroll]").evaluate((element) => element.scrollTo(0, 900));
    await expect(bar).toHaveAttribute("aria-hidden", "false");
  };
  await scrollDown();
  await expect(bar).toContainText("Favorites");

  await bar.getByRole("button", { name: "search this list" }).click();
  await expect(page.getByRole("textbox", { name: "filter this list" })).toBeFocused();
  await page.keyboard.press("Escape");
  // The filter sits at the top of the list, so opening it scrolled back up.
  await scrollDown();

  await bar.getByRole("combobox", { name: "sort" }).click();
  await page.getByRole("option", { name: "title" }).click();
  await expect(page.getByRole("group", { name: "sort this view" }).getByRole("button", { name: "title" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await bar.getByRole("button", { name: "play" }).click();
  await expect(page.getByRole("button", { name: "pause" }).first()).toBeVisible();
});
