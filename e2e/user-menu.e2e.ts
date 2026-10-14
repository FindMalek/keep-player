import { expect, test } from "./fixtures";

test("the user menu opens and switches the theme", async ({ page, signedIn }) => {
  await signedIn.getByRole("button", { name: /demo$/ }).click();
  await page.getByRole("menuitemradio", { name: "light" }).click();
  await expect(page.locator("html")).toHaveClass(/\blight\b/);
});

test("an admin sees the library index and can rebuild it", async ({ page, signedIn }) => {
  await signedIn.getByRole("button", { name: /demo$/ }).click();
  await page.getByRole("menuitem", { name: "library index" }).click();
  const dialog = page.getByRole("dialog", { name: "library index" });
  await dialog.getByRole("button", { name: "rebuild now" }).click();
  await expect(dialog.getByText("10,000")).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole("button", { name: "rebuild now" })).toBeEnabled();
});
