import { expect, fakeMediaClock, test, trackTitles } from "./fixtures";

test("once the next tracks are precached, going offline still plays and seeks them", async ({ page, context, signedIn }) => {
  await page.addInitScript(fakeMediaClock);
  await signedIn.goto("/album/al-3");
  // The service worker controls the page from its first load on.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const titles = await trackTitles(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await expect(page.locator("[aria-label=tracks]").getByLabel("saved for offline")).toHaveCount(3, { timeout: 15_000 });

  await context.setOffline(true);
  const bar = page.getByRole("contentinfo");
  for (const title of titles.slice(1, 4)) {
    await page.keyboard.press("n");
    await expect(bar.getByRole("link", { name: title as string })).toBeVisible();
  }
  const seek = page.locator("[data-slot=audio-player-seek]");
  const box = await seek.boundingBox();
  if (!box) throw new Error("no seek bar");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(1500);
  await expect(bar.getByRole("button", { name: "retry" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "pause" })).toBeVisible();
  // The bar keeps quiet about it unless you ask; the rows above always say it.
  await expect(bar.getByLabel("saved for offline")).toHaveCount(0);
  expect(await page.locator("[data-slot=audio-player-time][data-type=current]").textContent()).not.toBe("0:00");
});

test("close to the end, the next song loads once: the service worker drops its copy for the deck", async ({ page, signedIn }, info) => {
  // Its own album, so parallel repeats of this test don't count each other's streams.
  const album = `al-${41 + info.repeatEachIndex}`;
  await page.addInitScript(fakeMediaClock);
  await signedIn.goto(`/album/${album}`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const ids = await page.evaluate(async (id) => {
    const response = await fetch(`/rest/getAlbum?f=json&id=${id}`, { headers: { "x-keep-player": "1" } });
    return ((await response.json())["subsonic-response"].album.song as { id: string }[]).map((song) => song.id);
  }, album);
  const second = ids[1] as string;
  // The service worker's download of the second song will stall for a long time (it can't be routed by the page).
  const mock = "http://127.0.0.1:4599/mock";
  await page.request.post(`${mock}/slow?id=${encodeURIComponent(second)}&seconds=60`);
  const streams = async () =>
    (await (await page.request.get(`${mock}/streams?id=${encodeURIComponent(second)}`)).json()) as { aborted: boolean }[];

  await page.getByRole("button", { name: "play", exact: true }).first().click();
  // Once the first song is buffered, the worker starts on the second (and stalls).
  await expect.poll(async () => (await streams()).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  // Jump to the last seconds: the deck now loads the second song itself.
  const seek = page.locator("[data-slot=audio-player-seek]");
  const box = await seek.boundingBox();
  if (!box) throw new Error("no seek bar");
  await page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
  // The stalled worker download was cancelled, and the deck's own request is the only other one.
  await expect.poll(async () => (await streams())[0]?.aborted, { timeout: 10_000 }).toBe(true);
  await expect.poll(async () => (await streams()).length).toBe(2);
});
