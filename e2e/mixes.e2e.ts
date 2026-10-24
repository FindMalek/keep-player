import { expect, test } from "./fixtures";

test("songs you play become daily mixes on home, saved as navidrome playlists too", async ({ page, signedIn }) => {
  const call = (path: string, init?: { method?: string; body?: string }) =>
    page.evaluate(
      async ([url, options]) =>
        (await fetch(url, { ...options, headers: { "x-keep-player": "1", "content-type": "application/json" } })).json(),
      [path, init ?? {}] as const,
    );
  const random = await call("/rest/getRandomSongs?size=6&f=json");
  const songs = random["subsonic-response"].randomSongs.song as { id: string; genre?: string }[];
  // Six full listens of songs that share a genre: enough for a mix.
  const song = songs.find((item) => item.genre) ?? songs[0];
  for (let i = 0; i < 6; i++)
    await call("/api/history", {
      method: "POST",
      body: JSON.stringify({ song, started: Date.now() - (i + 1) * 3_600_000, listened: 200, finished: true }),
    });

  await signedIn.goto("/");
  const mixes = page.getByRole("list", { name: "daily mixes" });
  await expect(mixes.getByRole("button", { name: "play daily mix 1" })).toBeVisible();
  await expect
    .poll(async () => {
      const playlists = await call("/rest/getPlaylists?f=json");
      return (playlists["subsonic-response"].playlists.playlist as { name: string }[]).some((item) => item.name === "daily mix 1");
    })
    .toBe(true);

  await mixes.getByRole("button", { name: "play daily mix 1" }).click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
});
