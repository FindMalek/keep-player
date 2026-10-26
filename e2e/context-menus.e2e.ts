import type { Page } from "@playwright/test";
import { expect, test, trackTitles } from "./fixtures";

// The mock is shared: each test that adds to a playlist makes its own (unique name) and only touches that.
async function newPlaylist(page: Page, name: string): Promise<void> {
  await page.locator("body").press("Shift+N");
  const dialog = page.getByRole("dialog", { name: "new playlist" });
  await dialog.getByLabel("name").fill(name);
  await dialog.getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
}

test("right-click a song: the actions, and they act on the selection when the row is in it", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const titles = await trackTitles(page);
  const first = page.getByRole("row", { name: titles[0] as string }).first();
  await first.click({ button: "right" });
  const menu = page.getByRole("menu");
  for (const action of ["play", "play next", "add to queue", "add to playlist", "like", "go to artist", "copy link", "download"])
    await expect(menu.getByRole("menuitem", { name: action, exact: true })).toBeVisible();
  await menu.getByRole("menuitem", { name: "play", exact: true }).click();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: titles[0] as string, exact: true })).toBeVisible();

  // Two selected, right-click one of them: the menu is about both.
  for (const title of titles.slice(1, 3))
    await page
      .getByRole("row", { name: title as string })
      .first()
      .locator("td")
      .nth(1)
      .click({ modifiers: ["ControlOrMeta"] });
  await page
    .getByRole("row", { name: titles[1] as string })
    .first()
    .click({ button: "right" });
  await expect(page.getByRole("menu").getByText("2 songs")).toBeVisible();
  await page.getByRole("menu").getByRole("menuitem", { name: "add to queue" }).click();
  await expect(page.getByText("added 2 songs")).toBeVisible();
});

test("the ⋯ button opens the same actions, and an album card has its own on right-click", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const titles = await trackTitles(page);
  await page
    .getByRole("row", { name: titles[0] as string })
    .first()
    .getByRole("button", { name: /^more for / })
    .click();
  await expect(page.getByRole("menuitem", { name: "add to playlist" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/albums");
  const card = page
    .getByRole("main")
    .getByRole("link")
    .filter({ has: page.locator("img") })
    .first();
  await card.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "shuffle", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "download (zip)" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "play", exact: true }).click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
});

test("drag songs onto a sidebar playlist, onto the player bar to play next, and within the queue", async ({ page, signedIn }) => {
  const name = `Drag ${Date.now()}`;
  await signedIn.goto("/");
  await newPlaylist(page, name);
  await page.goto("/album/al-3");
  const titles = await trackTitles(page);

  const target = page.getByRole("navigation", { name: "sidebar" }).getByRole("link", { name, exact: true });
  await page
    .getByRole("row", { name: titles[0] as string })
    .first()
    .dragTo(target);
  await expect(page.getByText(`added ${titles[0]} to ${name}`)).toBeVisible();

  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page
    .getByRole("row", { name: titles[4] as string })
    .first()
    .dragTo(page.getByRole("contentinfo"));
  await expect(page.getByText(`${titles[4]} plays next`)).toBeVisible();

  // In the queue, within the album's songs (a song can't jump into your own up-next list): the later one takes the earlier's place.
  await page.keyboard.press("q");
  const queue = page.getByRole("list", { name: "queue" });
  const rows = queue.locator("li[data-queue-index]");
  await expect(rows.nth(3)).toBeVisible();
  const [first, second] = [await rows.nth(2).textContent(), await rows.nth(3).textContent()];
  await rows.nth(3).locator("[draggable=true]").dragTo(rows.nth(2));
  await expect.poll(async () => [await rows.nth(2).textContent(), await rows.nth(3).textContent()]).toEqual([second, first]);
});

test("on your own playlist, a row dropped onto another takes its place", async ({ page, signedIn }) => {
  const name = `Order ${Date.now()}`;
  await signedIn.goto("/");
  await newPlaylist(page, name);
  await page.goto("/album/al-5");
  const titles = await trackTitles(page);
  for (const title of titles.slice(0, 3))
    await page
      .getByRole("row", { name: title as string })
      .first()
      .locator("td")
      .nth(1)
      .click({ modifiers: ["ControlOrMeta"] });
  const bar = page.getByRole("toolbar", { name: "selection" });
  await bar.getByRole("button", { name: "add to playlist" }).click();
  await page.getByRole("menuitem", { name }).click();
  await expect(page.getByText(`added 3 songs to ${name}`)).toBeVisible();

  await page.getByRole("navigation", { name: "sidebar" }).getByRole("link", { name, exact: true }).click();
  const order = () => trackTitles(page);
  await expect.poll(order).toEqual(titles.slice(0, 3));
  await page
    .getByRole("row", { name: titles[2] as string })
    .first()
    .dragTo(page.getByRole("row", { name: titles[0] as string }).first());
  await expect.poll(order).toEqual([titles[2], titles[0], titles[1]]);
  await page.reload();
  await expect.poll(order).toEqual([titles[2], titles[0], titles[1]]);
});
