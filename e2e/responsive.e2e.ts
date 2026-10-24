import type { Page } from "@playwright/test";
import { expect, fakeMediaClock, test } from "./fixtures";

const SIZES: [number, number][] = [
  [2560, 1440],
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1100, 700],
  [900, 700],
  [768, 1024],
  [600, 800],
  [390, 844],
  [320, 640],
];

async function playPlaylist(page: Page): Promise<void> {
  await page.addInitScript(fakeMediaClock);
  await page.goto("/playlist/pl-1");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
}

test("the window is filled exactly at every size: one scrollbar, the bar in view, nothing overlapping or cut off", async ({
  signedIn: page,
}) => {
  test.setTimeout(120_000);
  await playPlaylist(page);
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    const found = await page.evaluate(() => {
      const bar = document.querySelector("footer")?.getBoundingClientRect();
      const controls = [...document.querySelectorAll<HTMLElement>("footer button, footer a, footer [role=slider]")]
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter((item) => item.box.width > 0);
      let overlaps = 0;
      for (let i = 0; i < controls.length; i++)
        for (let j = i + 1; j < controls.length; j++) {
          const a = controls[i];
          const b = controls[j];
          if (!a || !b || a.element.contains(b.element) || b.element.contains(a.element)) continue;
          if (a.box.left < b.box.right - 1 && b.box.left < a.box.right - 1 && a.box.top < b.box.bottom - 1 && b.box.top < a.box.bottom - 1)
            overlaps += 1;
        }
      return {
        docHeight: document.documentElement.scrollHeight,
        docWidth: document.documentElement.scrollWidth,
        barTop: bar?.top ?? -1,
        barBottom: bar?.bottom ?? -1,
        outside: controls.filter((item) => bar && (item.box.right > bar.right + 1 || item.box.left < bar.left - 1)).length,
        overlaps,
      };
    });
    const at = `${width}x${height}`;
    expect(found.docHeight, `${at}: the document itself scrolls vertically`).toBeLessThanOrEqual(height);
    expect(found.docWidth, `${at}: the document scrolls sideways`).toBeLessThanOrEqual(width);
    expect(found.barTop, `${at}: the player bar is off-screen`).toBeGreaterThan(0);
    expect(found.barBottom, `${at}: the player bar runs past the window`).toBeLessThanOrEqual(height + 1);
    expect(found.outside, `${at}: bar controls leave the bar`).toBe(0);
    expect(found.overlaps, `${at}: bar controls overlap`).toBe(0);
  }
});

test("the bar folds its rarely used controls into a menu as the window narrows", async ({ signedIn: page }) => {
  test.setTimeout(60_000);
  await playPlaylist(page);
  const bar = page.getByRole("contentinfo");

  // Even on a wide screen the sleep timer stays in the menu and song info waits on the cover until you hover it.
  await page.setViewportSize({ width: 2560, height: 1440 });
  await expect(bar.getByRole("button", { name: "sleep timer" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "song info" })).toHaveCount(0);
  await bar.locator("img").first().hover();
  await bar.getByRole("button", { name: "song info" }).click();
  await expect(bar.getByRole("button", { name: "song info" })).toHaveAttribute("aria-pressed", "true");
  await bar.getByRole("button", { name: "song info" }).click();

  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(bar.getByRole("button", { name: "shuffle" })).toBeVisible();
  await bar.getByRole("button", { name: "more controls" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "song info" })).toBeVisible();
  await page.getByRole("menuitem", { name: "sleep timer" }).hover();
  await page.getByRole("menuitemradio", { name: "30 minutes" }).click();
  // The timer is set: the menu's button shows its "on" state.
  await expect(bar.getByRole("button", { name: "more controls" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");

  // A phone-sized window keeps play and next, with shuffle, repeat and previous in the menu.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(bar.getByRole("button", { name: "shuffle" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "next" })).toBeVisible();
  await bar.getByRole("button", { name: "more controls" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "shuffle" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "previous" })).toBeVisible();
});

test("on a narrow window a menu button opens the sidebar, and going somewhere closes it", async ({ signedIn: page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await expect(page.getByRole("button", { name: "open menu" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "albums", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("link", { name: "albums", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "open menu" }).click();
  await page.getByRole("link", { name: "albums", exact: true }).click();
  await expect(page).toHaveURL(/\/albums$/);
  await expect(page.getByRole("link", { name: "albums", exact: true })).toHaveCount(0);
});

test("on a narrow window the queue takes the window instead of squeezing the page", async ({ signedIn: page }) => {
  await playPlaylist(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const bar = page.getByRole("contentinfo");
  await bar.getByRole("button", { name: "queue" }).click();
  const panel = page.getByRole("complementary", { name: "queue" });
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(380);
  await panel.getByRole("button", { name: "close queue" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Late night" })).toBeVisible();
});

test("on a phone the cover sits at the top of an album's header, beside the title, not at its bottom", async ({ signedIn: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/album/al-13");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  const cover = await page.locator("main header img").first().boundingBox();
  const badge = await page.getByText("album", { exact: true }).first().boundingBox();
  expect(cover).not.toBeNull();
  expect(badge).not.toBeNull();
  // Top-aligned: the cover starts level with the first line of the text block, give or take a few pixels.
  expect(Math.abs((cover?.y ?? 0) - (badge?.y ?? 0))).toBeLessThan(8);
});
