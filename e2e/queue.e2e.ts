import { expect, test } from "./fixtures";

test("your queue sits before the album, survives a reload, and saves as a playlist", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const title = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";
  await page.getByRole("button", { name: "play", exact: true }).first().click();

  // In-app navigation: a full reload here could race the queue's write to IndexedDB.
  await page.evaluate(() => {
    window.history.pushState({}, "", "/album/al-5");
    window.dispatchEvent(new Event("keep:navigate"));
  });
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(title);
  const queued = page.locator("[aria-label=tracks] tbody tr").nth(1);
  const queuedTitle = (await queued.locator("td").nth(1).locator("span").first().textContent()) ?? "";
  await queued.hover();
  await queued.getByRole("button", { name: /^add .* to queue$/ }).click();

  await page.keyboard.press("q");
  const panel = page.getByRole("complementary", { name: "queue" });
  await expect(panel.getByText("next in your queue")).toBeVisible();
  await expect(panel.getByText(`next from ${title}`)).toBeVisible();
  await expect(panel.getByText(queuedTitle, { exact: true })).toBeVisible();

  // The queue is in IndexedDB, written when the browser is idle.
  await page.waitForTimeout(1500);
  await page.reload();
  await page.keyboard.press("q");
  await expect(page.getByRole("complementary", { name: "queue" }).getByText(queuedTitle, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "save queue as playlist" }).click();
  await page.getByLabel("playlist name").fill("e2e queue");
  await page.getByRole("button", { name: "save", exact: true }).click();
  await expect(page.getByRole("link", { name: "e2e queue" })).toBeVisible();
});
