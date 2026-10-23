import { expect, fakeMediaClock, test, trackTitles } from "./fixtures";

const go = (page: import("@playwright/test").Page, path: string) =>
  page.evaluate((to) => {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new Event("keep:navigate"));
  }, path);

test("⌘Z brings back the album a misclick replaced, ⌘⇧Z replaces it again, and a cleared queue comes back", async ({ page, signedIn }) => {
  await page.addInitScript(fakeMediaClock);
  await signedIn.goto("/album/al-7");
  const first = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.keyboard.press("q");
  const panel = page.getByRole("complementary", { name: "queue" });
  await expect(panel.getByText(`next from ${first}`)).toBeVisible();

  await go(page, "/album/al-8");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(first);
  const second = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";
  // Queue a song from here, then play this album: the first one's songs are gone from the queue.
  const row = page.locator("[aria-label=tracks] tbody tr").nth(2);
  await row.hover();
  await row.getByRole("button", { name: /^add .* to queue$/ }).click();
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await expect(panel.getByText(`next from ${second}`)).toBeVisible();

  await page.locator("body").press("ControlOrMeta+z");
  await expect(page.getByText(`undid: started ${second}`)).toBeVisible();
  await expect(panel.getByText(`next from ${first}`)).toBeVisible();
  await page.locator("body").press("ControlOrMeta+Shift+z");
  await expect(panel.getByText(`next from ${second}`)).toBeVisible();

  // Clearing your queue is undoable from the keyboard as well as the toast.
  await expect(panel.getByText("next in your queue")).toBeVisible();
  await panel.getByRole("button", { name: /clear/ }).first().click();
  await expect(panel.getByText("next in your queue")).toHaveCount(0);
  await page.locator("body").press("ControlOrMeta+z");
  await expect(panel.getByText("next in your queue")).toBeVisible();
});

test("⌘Z in a text field undoes the typing, not the app", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-7");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByRole("dialog", { name: "search" }).getByRole("combobox");
  await input.fill("abc");
  await input.press("ControlOrMeta+z");
  await expect(page.getByText(/^undid:|^nothing to undo/)).toHaveCount(0);
});

test("adding to the queue says so, and undo takes exactly that back out", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-21");
  const titles = await trackTitles(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  const row = page.getByRole("row", { name: new RegExp(titles[3] as string) }).first();
  await row.hover();
  await row.getByRole("button", { name: `add ${titles[3]} to queue`, exact: true }).click();
  await expect(page.getByText(`added ${titles[3]} to the queue`)).toBeVisible();
  await page.locator("body").press("q");
  const queue = page.getByRole("complementary", { name: "queue" });
  await expect(queue.getByText("next in your queue")).toBeVisible();
  await page.getByRole("button", { name: "undo" }).click();
  await expect(queue.getByText("next in your queue")).toHaveCount(0);
});
