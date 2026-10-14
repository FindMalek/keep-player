import { expect, test, trackTitles } from "./fixtures";

// The 404 is injected with page.route, which doesn't see requests the service worker makes on the page's behalf.
test.describe(() => {
  test.use({ serviceWorkers: "block" });
  test("a song the server can't deliver is skipped with an undo, not a silent stop", async ({ page, signedIn }) => {
    await signedIn.goto("/album/al-3");
    const titles = await trackTitles(page);
    const firstId = await page.evaluate(async () => {
      const response = await fetch("/rest/getAlbum?f=json&id=al-3", { headers: { "x-keep-player": "1" } });
      return (await response.json())["subsonic-response"].album.song[0].id as string;
    });
    await page.route(`**/rest/stream?id=${firstId}&*`, (route) => route.fulfill({ status: 404, body: "" }));
    await page.getByRole("button", { name: "play", exact: true }).first().click();
    await expect(page.getByText(`skipped ${titles[0]}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "undo" })).toBeVisible();
    await expect(page.getByRole("contentinfo").getByRole("link", { name: titles[1] as string })).toBeVisible();
  });

  test("a stream that fails before any audio arrives is retried, not skipped as unplayable", async ({ page, signedIn }) => {
    await signedIn.goto("/album/al-3");
    const titles = await trackTitles(page);
    const firstId = await page.evaluate(async () => {
      const response = await fetch("/rest/getAlbum?f=json&id=al-3", { headers: { "x-keep-player": "1" } });
      return (await response.json())["subsonic-response"].album.song[0].id as string;
    });
    // The first request gets a gateway error, which Chrome reports as "format error", same as a bad file.
    let failed = false;
    await page.route(`**/rest/stream?id=${firstId}&*`, (route) => {
      if (failed) return route.continue();
      failed = true;
      return route.fulfill({ status: 502, body: "bad gateway" });
    });
    await page.getByRole("button", { name: "play", exact: true }).first().click();
    await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
    // Exact: "Ember" is also the start of the next title.
    await expect(page.getByRole("contentinfo").getByRole("link", { name: titles[0] as string, exact: true })).toBeVisible();
    await expect(page.getByText(/^skipped /)).toHaveCount(0);
  });
});

test("⇧S toggles stop after this song", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  const sleep = page.getByRole("contentinfo").getByRole("button", { name: "sleep timer" });
  await page.locator("body").press("Shift+S");
  await expect(page.getByText("will stop after this song")).toBeVisible();
  await expect(sleep).toHaveAttribute("aria-pressed", "true");
  await page.locator("body").press("Shift+S");
  await expect(sleep).toHaveAttribute("aria-pressed", "false");
});
