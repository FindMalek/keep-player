import type { Page } from "@playwright/test";
import { expect, test, trackTitles } from "./fixtures";

// The mock is shared by every test: each test makes its own playlist (unique name) and only touches that.

async function newPlaylist(page: Page, name: string): Promise<void> {
  await page.locator("body").press("Shift+N");
  const dialog = page.getByRole("dialog", { name: "new playlist" });
  await dialog.getByLabel("name").fill(name);
  await dialog.getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name.split(" / ").at(-1) as string);
}

/** ⌘/ctrl-click the first `count` rows of the tracklist. */
async function select(page: Page, titles: string[], count: number): Promise<void> {
  for (const title of titles.slice(0, count))
    await page
      .getByRole("row", { name: title })
      .first()
      .locator("td")
      .nth(1)
      .click({ modifiers: ["ControlOrMeta"] });
}

test("new playlist in a folder, then adding the same songs twice asks first", async ({ page, signedIn }) => {
  const name = `Road ${Date.now()}`;
  await signedIn.goto("/");
  await newPlaylist(page, `Trips / ${name}`);
  await expect(page.getByRole("navigation", { name: "sidebar" }).getByText("Trips")).toBeVisible();

  await page.goto("/album/al-27");
  const titles = await trackTitles(page);
  await select(page, titles, 2);
  const bar = page.getByRole("toolbar", { name: "selection" });
  await bar.getByRole("button", { name: "add to playlist" }).click();
  await page.getByRole("menuitem", { name: `Trips / ${name}` }).click();
  await expect(page.getByText(`added 2 songs to ${name}`)).toBeVisible();

  // The same two (still selected) again.
  await bar.getByRole("button", { name: "add to playlist" }).click();
  await page.getByRole("menuitem", { name: `Trips / ${name}` }).click();
  await expect(page.getByText(`2 of 2 already in ${name}`)).toBeVisible();
  await page.getByRole("button", { name: "skip", exact: true }).click();

  await page.getByRole("navigation", { name: "sidebar" }).getByText("Trips").click();
  await page.getByRole("navigation", { name: "sidebar" }).getByRole("link", { name }).click();
  await expect(page.getByText(/^2 tracks/)).toBeVisible();
});

test("on the playlist: rename, describe, reorder, hide, remove with undo, and keep a sorted view", async ({ page, signedIn }) => {
  const name = `Edit ${Date.now()}`;
  await signedIn.goto("/album/al-28");
  const titles = await trackTitles(page);
  await select(page, titles, 4);
  await page.getByRole("toolbar", { name: "selection" }).getByRole("button", { name: "add to playlist" }).click();
  await page.getByRole("menuitem", { name: "new playlist…" }).click();
  await page.getByRole("dialog", { name: "new playlist" }).getByLabel("name").fill(name);
  await page.getByRole("dialog", { name: "new playlist" }).getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  const list = await trackTitles(page);

  // Rename and describe in place.
  await page.getByRole("button", { name: new RegExp(`^playlist name: ${name}`) }).click();
  await page.getByLabel("playlist name").fill(`${name} renamed`);
  await page.getByLabel("playlist name").press("Enter");
  await expect(page.getByRole("navigation", { name: "sidebar" }).getByRole("link", { name: `${name} renamed` })).toBeVisible();
  await page.getByRole("button", { name: /^description: none/ }).click();
  await page.getByLabel("description").fill("for the drive");
  await page.getByLabel("description").press("Enter");

  // Move the first song down with the keyboard; it sticks after a reload.
  await page
    .getByRole("row", { name: list[0] as string })
    .first()
    .locator("td")
    .nth(1)
    .click();
  await page.keyboard.press("Alt+ArrowDown");
  // Straight away: a reload inside the save's debounce must still keep the order.
  await page.reload();
  await expect.poll(() => trackTitles(page)).toEqual([list[1], list[0], list[2], list[3]]);
  await expect(page.getByText("for the drive")).toBeVisible();

  // Hide one (kept, skipped when it plays), remove another and undo.
  const hideRow = page.getByRole("row", { name: list[2] as string }).first();
  await hideRow.hover();
  await hideRow.getByRole("button", { name: `hide ${list[2]} in this playlist` }).click();
  await expect(page.getByText(/· 1 hidden/)).toBeVisible();
  const removeRow = page.getByRole("row", { name: list[3] as string }).first();
  await removeRow.hover();
  await removeRow.getByRole("button", { name: `remove ${list[3]} from the playlist` }).click();
  await expect(page.getByText(/^3 tracks/)).toBeVisible();
  await page.getByRole("button", { name: "undo" }).click();
  await expect(page.getByText(/^4 tracks/)).toBeVisible();

  // A sorted view leaves the order alone until asked.
  await page.getByRole("group", { name: "sort this view" }).getByRole("button", { name: "title", exact: true }).click();
  const sorted = [...(list as string[])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  await expect.poll(() => trackTitles(page)).toEqual(sorted);
  await page.getByRole("button", { name: "make this the playlist order" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  await expect.poll(() => trackTitles(page)).toEqual(sorted);
  await expect(page.getByText(/· 1 hidden/)).toBeVisible();
});

test("delete waits 10 s for an undo, folders rename their playlists, smart playlists are read only", async ({ page, signedIn }) => {
  const stamp = Date.now();
  await signedIn.goto("/");
  await newPlaylist(page, `Old ${stamp} / Keep`);
  await page.getByRole("button", { name: "delete playlist" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("navigation", { name: "sidebar" }).getByText(`Old ${stamp}`)).toHaveCount(0);
  await page.getByRole("button", { name: "undo" }).click();
  await expect(page.getByRole("navigation", { name: "sidebar" }).getByText(`Old ${stamp}`)).toBeVisible();

  const folder = page.getByRole("navigation", { name: "sidebar" }).getByText(`Old ${stamp}`);
  await folder.hover();
  await page.getByRole("button", { name: `folder Old ${stamp}: rename or add a playlist` }).click();
  await page.getByRole("dialog").getByLabel("name").fill(`New ${stamp}`);
  await page.getByRole("dialog").getByRole("button", { name: "rename" }).click();
  await expect(page.getByRole("navigation", { name: "sidebar" }).getByText(`New ${stamp}`)).toBeVisible();

  await page.goto("/playlist/pl-smart");
  await expect(page.getByText("smart playlist · read only")).toBeVisible();
  await expect(page.getByRole("button", { name: "delete playlist" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^playlist name:/ })).toHaveCount(0);
});

test("the playlist that is playing stands out in the sidebar", async ({ signedIn: page }) => {
  await page.goto("/playlist/pl-3");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  const item = page.locator("[data-playlist-id=pl-3]");
  await expect(item.getByRole("img", { name: "playing" })).toBeVisible();
});
