import { expect, test } from "./fixtures";

test("chords navigate, with a hint while the second key is pending", async ({ page, signedIn }) => {
  await signedIn.locator("body").press("g");
  await expect(page.getByRole("status").filter({ hasText: "g" })).toBeVisible();
  await page.locator("body").press("a");
  await expect(page).toHaveURL(/\/albums$/);
  await page.locator("body").press("g");
  await page.locator("body").press("r");
  await expect(page).toHaveURL(/\/artists$/);
});

test("typing in the search box never triggers shortcuts", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  const shuffle = page.getByRole("contentinfo").getByRole("button", { name: "shuffle" });
  await expect(shuffle).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("dialog", { name: "search" }).getByRole("combobox").pressSequentially("s m q");
  // The open dialog hides the page from the accessibility tree; close it to look.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "search" })).toBeHidden();
  await expect(shuffle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("complementary", { name: "queue" })).toHaveCount(0);
});
