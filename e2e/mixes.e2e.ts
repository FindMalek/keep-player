import { expect, test } from "./fixtures";

test("songs you play become daily mixes on home, saved as navidrome playlists too", async ({ page, signedIn }) => {
  const call = (path: string, init?: { method?: string; body?: string }) =>
    page.evaluate(
      async ([url, options]) =>
        (await fetch(url, { ...options, headers: { "x-lodesong": "1", "content-type": "application/json" } })).json(),
      [path, init ?? {}] as const,
    );
  // Mixes are made from the library index (plays only say which artists you like).
  await call("/api/index", { method: "POST" });
  await expect.poll(async () => (await call("/api/index")).building, { timeout: 20_000 }).toBe(false);
  const random = await call("/rest/getRandomSongs?size=6&f=json");
  const songs = random["subsonic-response"].randomSongs.song as { id: string; genre?: string }[];
  // Six full listens of one artist: enough for a mix.
  const song = songs[0];
  for (let i = 0; i < 6; i++)
    await call("/api/history", {
      method: "POST",
      body: JSON.stringify({ song, started: Date.now() - (i + 1) * 3_600_000, listened: 200, finished: true }),
    });

  await signedIn.goto("/");
  const mixes = page.getByRole("list", { name: "made for you" });
  await expect(mixes.getByRole("button", { name: "play daily mix 1" })).toBeVisible();
  await expect
    .poll(async () => {
      const playlists = await call("/rest/getPlaylists?f=json");
      return (playlists["subsonic-response"].playlists.playlist as { name: string }[]).some((item) => item.name === "daily mix 1");
    })
    .toBe(true);

  // The card opens the mix as a playlist; the play button on it plays.
  await page.reload();
  await mixes.getByRole("link", { name: "daily mix 1" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("daily mix 1");
  await page.goBack();
  await mixes.getByRole("link", { name: "daily mix 1" }).hover();
  await mixes.getByRole("button", { name: "play daily mix 1" }).click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
});
