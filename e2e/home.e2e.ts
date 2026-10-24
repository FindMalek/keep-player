import { expect, test } from "./fixtures";

test("jump back in lists the album you just played from, newest first", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const name = (await page.getByRole("heading", { level: 1 }).textContent())?.trim() ?? "";
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.getByRole("navigation", { name: "sidebar" }).getByRole("link", { name: "home" }).click();
  const tile = page.getByRole("list", { name: "jump back in" }).getByRole("link").first();
  await expect(tile).toContainText(name);
  // Still playing: the tile says so.
  await expect(tile.getByRole("img", { name: "playing" })).toBeVisible();
});
