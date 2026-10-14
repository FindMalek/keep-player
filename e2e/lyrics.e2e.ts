import { expect, test } from "./fixtures";

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
  // so-4 is the album's fifth track.
  for (let i = 0; i < 4; i += 1) await page.keyboard.press("n");
  await page.keyboard.press("y");
  const panel = page.getByRole("complementary", { name: "lyrics" });
  await expect(panel.getByText("synced · lrclib")).toBeVisible();
  await expect(panel.getByRole("button", { name: /from lrclib 1$/ })).toBeVisible();
});
