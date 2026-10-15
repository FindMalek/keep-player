import { expect, test, trackTitles } from "./fixtures";

test.describe.configure({ mode: "serial" });

test("import a Spotify export: match, review, create the playlist once, list what's missing", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const titles = (await trackTitles(page)).slice(0, 3);
  const artist = (await page.locator('main a[href^="/artist/"]').first().textContent()) ?? "";

  const track = (trackName: string, artistName: string) => ({ track: { trackName, artistName } });
  const playlist = `E2E mix ${Date.now()}`;
  const file = {
    name: "Playlist1.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        playlists: [
          { name: playlist, items: [...titles.map((title) => track(title, artist)), track("Not In Library Xyzzy", "Nobody At All")] },
        ],
      }),
    ),
  };

  await signedIn.goto("/import");
  await page.getByLabel("spotify export files").setInputFiles(file);
  await expect(page.getByText("1 playlist · 0 liked songs")).toBeVisible();
  await page.getByRole("button", { name: "match with my library" }).click();

  await expect(page.getByRole("button", { name: "matched 3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "missing 1" })).toBeVisible();
  await page.getByRole("button", { name: "missing 1" }).click();
  await expect(page.getByText("Not In Library Xyzzy")).toBeVisible();
  await expect(page.getByText("not in your library")).toBeVisible();

  // Fix it by hand: search the library, pick a song, and the row is matched.
  await page.getByRole("button", { name: "change" }).click();
  await page.getByLabel("search for Not In Library Xyzzy").fill(titles[0] as string);
  await page
    .getByRole("button", { name: new RegExp(`^${titles[0]}`) })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "matched 4" })).toBeVisible();
  await expect(page.getByRole("button", { name: "missing 0" })).toBeVisible();

  // Twice: the second run rewrites the playlist instead of adding another.
  for (let run = 0; run < 2; run += 1) {
    await page.getByRole("button", { name: "create playlists and stars" }).click();
    await expect(page.getByText(/1 playlist and 0 liked songs are in your library/)).toBeVisible();
  }
  const named = await page.evaluate(async (name) => {
    const response = await fetch("/rest/getPlaylists?f=json", { headers: { "x-keep-player": "1" } });
    const body = (await response.json())["subsonic-response"].playlists.playlist as { name: string }[];
    return body.filter((entry) => entry.name === `Spotify / ${name}`).length;
  }, playlist);
  expect(named).toBe(1);

  // Skipping a track puts it on the missing list.
  await page.getByRole("button", { name: "matched 4" }).click();
  await page.getByRole("button", { name: "skip" }).first().click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /missing list/ }).click();
  expect((await download).suggestedFilename()).toBe("spotify-missing.csv");
});
