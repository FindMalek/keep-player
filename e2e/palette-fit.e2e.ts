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

test("a new search starts at the top with its first result selected", async ({ page, signedIn }) => {
  test.setTimeout(60_000);
  await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  const box = page.getByRole("dialog", { name: "search" }).getByRole("combobox");
  await expect(box).toBeFocused();
  await box.fill("a");
  await expect(page.locator('[cmdk-item][data-value^="top-"]').first()).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowDown");
  const first = () => page.locator("[cmdk-item]").first().getAttribute("data-value");
  const before = await first();
  await box.fill("night");
  await expect.poll(first).not.toBe(before);
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => {
    let scrolled = 0;
    for (let element = document.querySelector<HTMLElement>("[cmdk-list]"); element; element = element.parentElement)
      scrolled += element.scrollTop;
    return { scrolled, firstSelected: document.querySelector("[cmdk-item]")?.getAttribute("data-selected") === "true" };
  });
  expect(state).toEqual({ scrolled: 0, firstSelected: true });
});
