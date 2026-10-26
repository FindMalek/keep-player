import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Data requests (Subsonic proxy, api, rpc) made by switching back to the tab, as a browser does after an alt-tab. */
async function requestsOnFocus(page: Page): Promise<string[]> {
  // Never "networkidle": the device socket and covers keep the page busy.
  await page.waitForTimeout(1500);
  const seen: string[] = [];
  const listen = (request: { url: () => string }) => {
    const { pathname } = new URL(request.url());
    if (/^\/(rest|api)\//.test(pathname)) seen.push(pathname);
  };
  page.on("request", listen);
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(1000);
  page.off("request", listen);
  return seen;
}

test("switching back to the tab refetches nothing that was just loaded", async ({ page, signedIn }) => {
  await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
  const counts: Record<string, string[]> = { home: await requestsOnFocus(page) };
  await page.locator('a[href^="/album/"]').first().click();
  await expect(page.getByRole("grid", { name: "tracks" })).toBeVisible();
  counts.album = await requestsOnFocus(page);
  await page.goto("/playlists");
  await page.locator('a[href^="/playlist/"]').first().click();
  await expect(page.getByRole("grid", { name: "tracks" })).toBeVisible();
  counts.playlist = await requestsOnFocus(page);
  await page.goto("/stats");
  counts.stats = await requestsOnFocus(page);
  console.info(JSON.stringify(counts));
  for (const requests of Object.values(counts)) expect(requests).toEqual([]);
});
