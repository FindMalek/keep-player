import { expect, test } from "./fixtures";

test("the user menu opens and switches the theme", async ({ page, signedIn }) => {
  await signedIn.getByRole("button", { name: /demo$/ }).click();
  await page.getByRole("menuitemradio", { name: "light" }).click();
  await expect(page.locator("html")).toHaveClass(/\blight\b/);
});
