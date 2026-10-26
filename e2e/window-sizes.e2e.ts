import { expect, test } from "./fixtures";

// A short mac window, a narrow one, a phone, a big screen.
const SIZES = [
  [1280, 480],
  [700, 800],
  [390, 844],
  [2560, 1440],
] as const;
const PAGES = ["/", "/albums", "/artists", "/songs", "/playlists", "/stats", "/history", "/genres", "/folders", "/liked"];

test("no page runs off the side at any window size", async ({ page, signedIn }) => {
  test.setTimeout(120_000);
  await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
  const album = (await page.locator('a[href^="/album/"]').first().getAttribute("href")) ?? "/";
  const problems: string[] = [];
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    for (const path of [...PAGES, album]) {
      await page.goto(path);
      await page.waitForTimeout(400);
      const off = await page.evaluate((vw) => {
        const out: string[] = [];
        if (document.documentElement.scrollWidth > vw + 1) out.push("page scrolls sideways");
        for (const el of document.querySelectorAll<HTMLElement>("button, a, input, [role=slider]")) {
          const box = el.getBoundingClientRect();
          if (box.width && box.height && (box.right > vw + 1 || box.left < -1))
            out.push((el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30));
        }
        return out;
      }, width);
      for (const item of off) problems.push(`${width}×${height} ${path}: ${item}`);
    }
  }
  expect(problems).toEqual([]);
});

test("home shelves fill their rows, from a narrow window to a big screen", async ({ page, signedIn }) => {
  await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
  for (const [width, height] of [SIZES[1], SIZES[3]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    const shelf = page.locator("section", { hasText: "recently added" }).first();
    const { gap, uneven } = await shelf.evaluate((section) => {
      const boxes = [...section.querySelectorAll('a[href^="/album/"]')].map((link) => link.getBoundingClientRect());
      const rows = new Map<number, number>();
      for (const box of boxes) rows.set(Math.round(box.top), (rows.get(Math.round(box.top)) ?? 0) + 1);
      const right = Math.max(...boxes.map((box) => box.right));
      return { gap: section.getBoundingClientRect().right - right, uneven: new Set(rows.values()).size > 1 };
    });
    // The last card reaches the end of the row (less than a card's width left over), and no row is shorter.
    expect(gap).toBeLessThan(150);
    expect(uneven).toBe(false);
  }
});

test("⌘K sits in the middle of every window, inside it", async ({ page, signedIn }) => {
  await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
  for (const [width, height] of [...SIZES, [1000, 1280] as const]) {
    await page.setViewportSize({ width, height });
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog", { name: "search" });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(250);
    const box = await dialog.boundingBox();
    if (!box) throw new Error("no palette");
    const above = box.y;
    const below = height - box.y - box.height;
    expect(above, `${width}×${height}`).toBeGreaterThanOrEqual(8);
    expect(Math.abs(above - below), `${width}×${height}`).toBeLessThanOrEqual(2);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});
