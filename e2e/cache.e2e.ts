import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** From now on every API call takes 5 s, so anything that shows up well before that came from the cache. */
async function slowApi(page: Page): Promise<void> {
  await page.route("**/rest/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.continue().catch(() => undefined);
  });
}

test("hovering an album prefetches it, and back to home needs no network", async ({ page, signedIn }) => {
  await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
  const href = (await page.locator('a[href^="/album/"]').first().getAttribute("href")) ?? "";
  const id = href.split("/").pop() ?? "";
  const link = page.locator(`a[href="${href}"]`).first();
  // Listen before hovering: a fast prefetch can finish before a later listener starts.
  const prefetched = page.waitForResponse((response) => response.url().includes("/rest/getAlbum?") && response.url().includes(`id=${id}`));
  await link.hover();
  await (await prefetched).finished();
  await slowApi(page);
  await link.click();
  await expect(page.getByRole("grid", { name: "tracks" })).toBeVisible({ timeout: 4000 });
  await page.goBack();
  await expect(page.locator('a[href^="/album/"]').first()).toBeVisible({ timeout: 4000 });
});

test("a reload paints the library from IndexedDB before the server answers", async ({ page, signedIn }) => {
  await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
  // The persister writes at most once a second.
  await page.waitForTimeout(1500);
  await slowApi(page);
  await page.reload();
  await expect(page.locator('a[href^="/album/"]').first()).toBeVisible({ timeout: 4000 });
});

test("logging out deletes the persisted cache", async ({ page, signedIn }) => {
  await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
  const cached = () =>
    page
      .evaluate(
        () =>
          new Promise<number>((resolve) => {
            const open = indexedDB.open("keyval-store");
            open.onsuccess = () => {
              const request = open.result.transaction("keyval").objectStore("keyval").get("keep-player:cache");
              request.onsuccess = () =>
                resolve(
                  request.result ? (JSON.parse(request.result) as { clientState: { queries: unknown[] } }).clientState.queries.length : 0,
                );
              request.onerror = () => resolve(0);
            };
            open.onerror = () => resolve(0);
          }),
      )
      .catch(() => -1);
  await expect.poll(cached, { timeout: 5000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: /demo$/ }).click();
  await page.getByRole("menuitem", { name: "log out" }).click();
  await expect(page.getByRole("button", { name: "sign in" })).toBeVisible();
  await expect.poll(cached).toBe(0);
});
