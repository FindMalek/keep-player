import { expect, test } from "./fixtures";

// The mac app's window, a laptop with the dock up, a narrow window, a big screen: the palette and its footer stay in view.
for (const [width, height] of [
  [1280, 560],
  [900, 480],
  [700, 900],
  [1920, 1080],
] as const) {
  test(`⌘K fits a ${width}×${height} window, footer included`, async ({ page, signedIn }) => {
    await page.setViewportSize({ width, height });
    await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    // A common letter: a long list of songs, albums and artists.
    await page.getByRole("combobox").fill("e");
    const footer = page.getByRole("button", { name: /see all results/ });
    await expect(footer).toBeVisible();
    const dialog = await page.getByRole("dialog").boundingBox();
    const bottom = await footer.boundingBox();
    expect(dialog && dialog.y >= 0 && dialog.y + dialog.height <= height).toBe(true);
    expect(bottom && bottom.y + bottom.height <= height).toBe(true);
  });
}

test("the shortcuts sheet scrolls to its last shortcut in a short window", async ({ page, signedIn }) => {
  await page.setViewportSize({ width: 900, height: 480 });
  await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
  await page.locator("body").press("?");
  const sheet = page.getByRole("dialog", { name: "keyboard shortcuts" });
  const last = sheet.locator("section").last().locator("li, tr, [role=row]").last();
  // The way a person gets there: the wheel over the list.
  await sheet.locator("section").first().hover();
  await page.mouse.wheel(0, 10_000);
  await page.waitForTimeout(300);
  const box = await last.boundingBox();
  expect(box && box.y >= 0 && box.y + box.height <= 480).toBe(true);
});
