import { expect, test, trackTitles } from "./fixtures";

test("removing from the queue can be undone", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-22");
  const titles = await trackTitles(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.locator("body").press("q");
  const queue = page.getByRole("complementary", { name: "queue" });
  const row = queue.getByRole("listitem").filter({ hasText: titles[2] as string });
  await row.hover();
  await row.getByRole("button", { name: `remove ${titles[2]}` }).click();
  await expect(page.getByText(`removed ${titles[2]} from the queue`)).toBeVisible();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "undo" }).click();
  await expect(queue.getByRole("listitem").filter({ hasText: titles[2] as string })).toHaveCount(1);
});

test("the last song offers a random mix to keep going", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-22");
  const titles = await trackTitles(page);
  await page
    .getByRole("row", { name: titles.at(-1) as string })
    .first()
    .locator("td")
    .nth(1)
    .dblclick();
  await page.locator("body").press("q");
  const queue = page.getByRole("complementary", { name: "queue" });
  await expect(queue.getByText("nothing up next")).toBeVisible();
  await queue.getByRole("button", { name: "keep going with a random mix" }).click();
  await expect(page.getByText("added 50 songs to the queue")).toBeVisible();
  await expect(queue.getByText("nothing up next")).toHaveCount(0);
});

test.describe(() => {
  // Failures are injected with page.route, which doesn't see requests the service worker makes.
  test.use({ serviceWorkers: "block" });

  test("a server that stops answering gets a banner that clears once it's back", async ({ page, signedIn }) => {
    await signedIn.goto("/");
    await page.route("**/rest/**", (route) => route.fulfill({ status: 502, body: "" }));
    await page.goto("/albums");
    const banner = page.getByRole("status").filter({ hasText: "server unreachable" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("playing from cache");
    await page.unroute("**/rest/**");
    await banner.getByRole("button", { name: "retry" }).click();
    await expect(banner).toHaveCount(0);
  });

  test("one failing home row says so with a retry, the others still load", async ({ page, signedIn }) => {
    let fail = true;
    await page.route("**/rest/getAlbumList2?*type=recent*", (route) =>
      fail ? route.fulfill({ status: 500, body: "" }) : route.continue(),
    );
    await signedIn.goto("/");
    const alert = page.getByRole("alert").filter({ hasText: "couldn't load recently played" });
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "recently added" })).toBeVisible();
    fail = false;
    await alert.getByRole("button", { name: "retry" }).click();
    await expect(alert).toHaveCount(0);
  });

  test("a page that breaks shows what happened and the rest of the app keeps working", async ({ page, signedIn }) => {
    await page.route("**/rest/getAlbum?*id=al-5*", (route) =>
      route.fulfill({ json: { "subsonic-response": { status: "ok", album: { id: "al-5", name: "broken", song: "not a list" } } } }),
    );
    await signedIn.goto("/album/al-5");
    await expect(page.getByText("something broke on this page")).toBeVisible();
    await expect(page.getByRole("button", { name: "copy details" })).toBeVisible();
    await page.getByRole("link", { name: "albums" }).first().click();
    await expect(page.getByRole("heading", { name: "albums", level: 1 })).toBeVisible();
  });
});
