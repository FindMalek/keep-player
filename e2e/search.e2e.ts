import { expect, test } from "./fixtures";

test("⌘K finds a song and picking it plays it", async ({ signedIn: page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill("ember");
  await expect(dialog.getByRole("group", { name: "songs" })).toBeVisible();
  await dialog.getByRole("group", { name: "songs" }).getByRole("option").first().click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
});
