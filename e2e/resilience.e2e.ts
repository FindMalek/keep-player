import { expect, test, trackTitles } from "./fixtures";

// The 404 is injected with page.route, which doesn't see requests the service worker makes on the page's behalf.
test.describe(() => {
  test.use({ serviceWorkers: "block" });
  test("a song the server can't deliver is skipped with an undo, not a silent stop", async ({ page, signedIn }) => {
    await signedIn.goto("/album/al-3");
    const titles = await trackTitles(page);
    const firstId = await page.evaluate(async () => {
      const response = await fetch("/rest/getAlbum?f=json&id=al-3", { headers: { "x-lodesong": "1" } });
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
      const response = await fetch("/rest/getAlbum?f=json&id=al-3", { headers: { "x-lodesong": "1" } });
      return (await response.json())["subsonic-response"].album.song[0].id as string;
    });
    let failed = false;
    await page.route(`**/rest/stream?id=${firstId}&*`, (route) => {
      if (failed) return route.continue();
      failed = true;
      return route.fulfill({ status: 502, body: "bad gateway" });
    });
    await page.getByRole("button", { name: "play", exact: true }).first().click();
    await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
    await expect(page.getByRole("contentinfo").getByRole("link", { name: titles[0] as string, exact: true })).toBeVisible();
    await expect(page.getByText(/^skipped /)).toHaveCount(0);
  });

  test("a slow stream keeps its one request, and nothing else downloads until it is safely buffered", async ({ page, signedIn }) => {
    await signedIn.goto("/album/al-3");
    const titles = await trackTitles(page);
    const ids = await page.evaluate(async () => {
      const response = await fetch("/rest/getAlbum?f=json&id=al-3", { headers: { "x-lodesong": "1" } });
      return ((await response.json())["subsonic-response"].album.song as { id: string }[]).map((song) => song.id);
    });
    const [first, second] = ids as [string, string];
    // The first song's link stalls for 6 s after its first 3 s of audio; the old watchdog reloaded it after 4.
    const requests: { id: string; at: number }[] = [];
    const start = Date.now();
    await page.route("**/rest/stream?*", (route) => {
      const url = new URL(route.request().url());
      const id = url.searchParams.get("id") ?? "";
      requests.push({ id, at: Date.now() - start });
      if (id !== first) return route.continue();
      url.searchParams.set("mockPause", "6");
      return route.continue({ url: url.toString() });
    });
    await page.getByRole("button", { name: "play", exact: true }).first().click();
    const bar = page.getByRole("contentinfo");
    await expect(bar.getByRole("link", { name: titles[0] as string, exact: true })).toBeVisible();
    await expect(bar.getByRole("status", { name: "buffering" })).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(8_000);
    await expect(page.getByText(/^skipped /)).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "pause" })).toBeVisible();
    expect(requests.filter((request) => request.id === first)).toHaveLength(1);
    // The next song only starts downloading once the first one's stall is over and it is fully buffered.
    const firstOfNext = requests.find((request) => request.id === second);
    expect(firstOfNext).toBeDefined();
    expect(firstOfNext?.at).toBeGreaterThan(6000);
  });
});

test("⇧S toggles stop after this song", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  const sleep = page.getByRole("contentinfo").getByRole("button", { name: "more controls" });
  await page.locator("body").press("Shift+S");
  await expect(page.getByText("will stop after this song")).toBeVisible();
  await expect(sleep).toHaveAttribute("aria-pressed", "true");
  await page.locator("body").press("Shift+S");
  await expect(sleep).toHaveAttribute("aria-pressed", "false");
});
