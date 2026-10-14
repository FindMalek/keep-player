import { expect, test } from "./fixtures";

test("a song the server can't deliver is skipped with an undo, not a silent stop", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const titles = await page.locator("[aria-label=tracks] tbody tr td:nth-child(2) span:first-child").allTextContents();
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
