import { expect, test } from "./fixtures";

test("covers are webp from /cover, cached as immutable, and a reload takes them from the browser cache", async ({ page, signedIn }) => {
  const first = page.waitForResponse((response) => response.url().includes("/cover/"));
  await signedIn.goto("/albums");
  const response = await first;
  expect(response.headers()["content-type"]).toBe("image/webp");
  expect(response.headers()["cache-control"]).toContain("immutable");
  await expect(page.locator("img[src^='/cover/']").first()).toHaveCSS("opacity", "1");
  // Only finished downloads land in the cache; let every visible cover complete first.
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));

  await page.reload();
  await expect(page.locator("img[src^='/cover/']").first()).toHaveCSS("opacity", "1");
  const fromNetwork = await page.evaluate(
    () =>
      performance
        .getEntriesByType("resource")
        .filter((entry) => entry.name.includes("/cover/"))
        .filter((entry) => (entry as PerformanceResourceTiming).transferSize > 0).length,
  );
  expect(fromNetwork).toBe(0);
});
