import { expect, fakeMediaClock, test } from "./fixtures";

test("lyrics come from Navidrome, fall back to LRCLIB, and say when there are none", async ({ page, signedIn }) => {
  const lyricsOf = (id: string) =>
    page.evaluate(async (songId) => (await fetch(`/api/lyrics/${songId}`, { headers: { "x-keep-player": "1" } })).json(), id);
  await signedIn.goto("/");
  // The fixture: Navidrome has synced lyrics for so-2, 5, 8…, plain for so-0, 3, 6…, none for so-1, 4, 7…;
  // LRCLIB knows the even-numbered ones of those.
  expect(await lyricsOf("so-2")).toMatchObject({ status: "synced", source: "navidrome" });
  expect(await lyricsOf("so-0")).toMatchObject({ status: "plain", source: "navidrome" });
  expect(await lyricsOf("so-4")).toMatchObject({ status: "synced", source: "lrclib" });
  expect(await lyricsOf("so-1")).toMatchObject({ status: "missing" });
});

test("the lyrics panel shows LRCLIB lyrics for a song Navidrome has none for", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-0");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  for (let i = 0; i < 4; i += 1) await page.keyboard.press("n");
  await page.keyboard.press("y");
  const panel = page.getByRole("complementary", { name: "lyrics" });
  await expect(panel.getByRole("button", { name: /from lrclib 1$/ })).toBeVisible();
  await expect(panel.getByRole("link", { name: "off-sync? report on lrclib" })).toHaveAttribute("href", "https://lrclib.net/tracks/4");
});

test("synced lyrics follow the song, a click seeks, and ] nudges the timing for good", async ({ page, signedIn }) => {
  await page.addInitScript(fakeMediaClock);
  await signedIn.goto("/album/al-0");
  // The nudge is saved on the server, so a retry would start from the last run's.
  await page.evaluate(() =>
    fetch("/api/lyrics/so-2/offset", {
      method: "PUT",
      headers: { "x-keep-player": "1", "content-type": "application/json" },
      body: JSON.stringify({ offset: 0 }),
    }),
  );
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.keyboard.press("n");
  await page.keyboard.press("n");
  await page.keyboard.press("y");
  const panel = page.getByRole("complementary", { name: "lyrics" });
  const third = panel.getByRole("button", { name: /line 3$/ });
  await third.click();
  await expect
    .poll(async () => seconds(await page.locator("[data-slot=audio-player-time][data-type=current]").textContent()))
    .toBeGreaterThanOrEqual(10);
  await expect(third).toHaveClass(/text-foreground/);

  await page.locator("body").press("]");
  await expect(panel.getByText("+0.25 s")).toBeVisible();
  await page.waitForTimeout(900);
  await page.reload();
  await page.keyboard.press("y");
  await expect(page.getByRole("complementary", { name: "lyrics" }).getByText("+0.25 s")).toBeVisible();
});

test("a song with no lyrics anywhere offers an LRCLIB search", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-0");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.keyboard.press("n");
  await page.keyboard.press("y");
  const panel = page.getByRole("complementary", { name: "lyrics" });
  await expect(panel.getByText("no lyrics for this song")).toBeVisible();
  await expect(panel.getByRole("link", { name: "search lrclib" })).toBeVisible();
});

const seconds = (text: string | null) => (text ?? "0:00").split(":").reduce((total, part) => total * 60 + Number(part), 0);
