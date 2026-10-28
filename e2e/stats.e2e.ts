import { expect, test } from "./fixtures";

const DAY = 86_400_000;

test("stats show what you played, forgotten favourites make a playlist, and the recap tells the story", async ({ page, signedIn }) => {
  // Plays from this test only (the account is shared with other tests): a made-up artist, and songs from long ago.
  const tag = `stats-${test.info().repeatEachIndex}-${Date.now()}`;
  const post = (song: Record<string, unknown>, started: number) =>
    signedIn.evaluate(
      async ([body]) =>
        (
          await fetch("/api/history", {
            method: "POST",
            headers: { "x-lodesong": "1", "content-type": "application/json" },
            body: JSON.stringify(body),
          })
        ).status,
      [{ song, started, listened: 240, finished: true }] as const,
    );
  const now = Date.now();
  for (let i = 0; i < 40; i++)
    expect(
      await post(
        { id: "so-11", title: "Recent", artist: tag, artistId: tag, album: "A", albumId: "al-2", genre: "Testcore" },
        now - i * 60_000,
      ),
    ).toBe(200);
  for (let i = 0; i < 3; i++)
    expect(await post({ id: "so-12", title: `${tag} old`, artist: "Old", album: "B", albumId: "al-3" }, now - (90 + i) * DAY)).toBe(200);

  await page.locator("body").press("g");
  await page.locator("body").press("t");
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByRole("link", { name: tag })).toBeVisible();
  await expect(page.getByRole("img", { name: /listening clock/ })).toBeVisible();
  await expect(page.locator("[data-slot=chart]")).toBeVisible();
  // The figures sit in equal tiles, each saying what it counts, and the clock has a legend.
  const tiles = page.locator("dl > div");
  await expect(tiles).toHaveCount(6);
  const widths = await tiles.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().width)));
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  await expect(page.getByText(/first heard here/)).toBeVisible();
  await expect(page.getByText(/^less/)).toBeVisible();

  await page.getByRole("group", { name: "range" }).getByRole("button", { name: "year" }).click();
  await expect(page.getByRole("link", { name: tag })).toBeVisible();

  const forgotten = page
    .getByRole("main")
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "forgotten favourites" }) });
  await expect(forgotten.getByRole("row", { name: new RegExp(`${tag} old`) })).toBeVisible();
  await forgotten.getByRole("button", { name: "make a playlist" }).click();
  await expect(page).toHaveURL(/\/playlist\//);

  await page.goBack();
  await page.getByRole("button", { name: "recap" }).click();
  const recap = page.getByRole("dialog", { name: "recap" });
  await expect(recap.getByRole("region", { name: "recap slide" })).toContainText(/minutes|hours/);
  await recap.getByRole("button", { name: "next" }).click();
  await expect(recap.getByRole("region", { name: "recap slide" })).toContainText("your top artist");
  await page.keyboard.press("ArrowLeft");
  await expect(recap.getByRole("region", { name: "recap slide" })).not.toContainText("your top artist");
  const download = page.waitForEvent("download");
  await recap.getByRole("button", { name: "save image" }).click();
  expect((await download).suggestedFilename()).toMatch(/^lodesong-recap-.+\.png$/);
});
