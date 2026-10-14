import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** From now on every API call takes 5 s, so anything that shows up sooner came from the cache. */
async function slowApi(page: Page): Promise<void> {
  await page.route("**/rest/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.continue().catch(() => undefined);
  });
}

test("hovering an album prefetches it, and back to home needs no network", async ({ page, signedIn }) => {
  await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
  const link = page.locator('a[href^="/album/"]').first();
  await link.hover();
  await page.waitForResponse((response) => response.url().includes("/rest/getAlbum?"));
  await slowApi(page);
  await link.click();
  await expect(page.getByRole("table", { name: "tracks" })).toBeVisible({ timeout: 1000 });
  await page.goBack();
  await expect(page.locator('a[href^="/album/"]').first()).toBeVisible({ timeout: 1000 });
});

test("a reload paints the library from IndexedDB before the server answers", async ({ page, signedIn }) => {
  await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
  // The persister writes at most once a second.
  await page.waitForTimeout(1500);
  await slowApi(page);
  await page.reload();
  await expect(page.locator('a[href^="/album/"]').first()).toBeVisible({ timeout: 1000 });
});

test("logging out deletes the persisted cache", async ({ page, signedIn }) => {
  await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
  // Number of queries in the persisted cache (the persister may leave an empty snapshot behind).
  const cached = () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          // idb-keyval's default database and store.
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
    );
  await expect.poll(cached, { timeout: 5000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: /demo$/ }).click();
  await page.getByRole("menuitem", { name: "log out" }).click();
  await expect(page.getByRole("button", { name: "sign in" })).toBeVisible();
  await expect.poll(cached).toBe(0);
});
