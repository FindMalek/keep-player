import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Sums layout shifts not caused by input, from the start of the page (buffered), into window.__cls. */
function watchShifts(): void {
  const scope = window as unknown as { __cls: number; __shifts: string[] };
  scope.__cls = 0;
  scope.__shifts = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node }[] })[])
      if (!entry.hadRecentInput) {
        scope.__cls += entry.value;
        scope.__shifts.push(
          (entry.sources ?? []).map((source) => (source.node as Element | undefined)?.outerHTML?.slice(0, 120) ?? "?").join(" | "),
        );
      }
  }).observe({ type: "layout-shift", buffered: true });
}

async function shifts(page: Page): Promise<{ cls: number; shifts: string[] }> {
  // Let late data (top songs, covers) and the 150 ms skeleton delay play out.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const scope = window as unknown as { __cls: number; __shifts: string[] };
    return { cls: scope.__cls, shifts: scope.__shifts };
  });
}

const ROUTES = ["/", "/albums", "/artists", "/songs", "/genres", "/liked", "/album/al-3", "/artist/ar-2", "/playlist/pl-1", "/folders"];

for (const route of ROUTES)
  test(`nothing moves while ${route} loads`, async ({ page, signedIn }) => {
    await page.addInitScript(watchShifts);
    await signedIn.goto(route);
    expect(await shifts(page)).toEqual({ cls: 0, shifts: [] });
  });

test.describe(() => {
  // The album request is held with page.route, which doesn't see requests the service worker makes.
  test.use({ serviceWorkers: "block" });
  test("opening an album from the grid paints its header from the card and moves nothing", async ({ page, signedIn }) => {
    await page.addInitScript(watchShifts);
    await signedIn.goto("/albums");
    await page.route("**/rest/getAlbum?*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue().catch(() => undefined);
    });
    const card = page
      .getByRole("main")
      .getByRole("link")
      .filter({ has: page.locator("img") })
      .nth(5);
    const name = (await card.locator("span").first().textContent()) as string;
    await card.click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 1000 });
    expect(await shifts(page)).toEqual({ cls: 0, shifts: [] });
  });
});
