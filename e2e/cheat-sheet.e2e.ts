import { expect, test } from "./fixtures";

test("? shows every shortcut, filters, and rebinding works right away", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.locator("body").press("?");
  const sheet = page.getByRole("dialog", { name: "keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("filter shortcuts").fill("shuffle");
  await expect(sheet.getByRole("listitem")).toHaveCount(1);

  await sheet.getByRole("button", { name: "change the key for shuffle" }).click();
  await page.keyboard.press("x");
  await expect(sheet.getByRole("listitem").getByText("x", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  const shuffle = page.getByRole("contentinfo").getByRole("button", { name: "shuffle" });
  await page.locator("body").press("x");
  await expect(shuffle).toHaveAttribute("aria-pressed", "true");
  await page.locator("body").press("s");
  await expect(shuffle).toHaveAttribute("aria-pressed", "true");
});

test("the palette lists actions with their keys", async ({ page, signedIn }) => {
  await signedIn.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "search" });
  await palette.getByRole("combobox").fill("genres");
  await palette.getByRole("option", { name: /go to genres/ }).click();
  await expect(page).toHaveURL(/\/genres$/);
});
