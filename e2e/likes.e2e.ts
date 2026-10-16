import { expect, test, trackTitles } from "./fixtures";

// The mock's stars are shared by every test in the run, so each test uses its own album and only checks its own likes.

test("a heart on a row likes the song for good, F likes what's playing, and both land on liked songs", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-11");
  const titles = await trackTitles(page);
  const first = titles[0] as string;
  const row = page.getByRole("row", { name: new RegExp(first) }).first();
  await row.hover();
  await row.getByRole("button", { name: `like ${first}`, exact: true }).click();
  await expect(row.getByRole("button", { name: `unlike ${first}`, exact: true })).toHaveAttribute("aria-pressed", "true");

  // Play the second track and like it from the keyboard.
  await page
    .getByRole("row", { name: new RegExp(titles[1] as string) })
    .first()
    .dblclick();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: `like ${titles[1]}`, exact: true })).toBeVisible();
  await page.locator("body").press("f");
  await expect(page.getByRole("contentinfo").getByRole("button", { name: `unlike ${titles[1]}`, exact: true })).toBeVisible();

  await page.reload();
  await page.locator("body").press("g");
  await page.locator("body").press("l");
  await expect(page).toHaveURL(/\/liked$/);
  const main = page.getByRole("main");
  await expect(main.getByRole("row", { name: new RegExp(first) }).first()).toBeVisible();
  await expect(main.getByRole("row", { name: new RegExp(titles[1] as string) }).first()).toBeVisible();

  // Unlike from the list, then undo.
  const likedRow = main.getByRole("row", { name: new RegExp(first) }).first();
  await likedRow.hover();
  await likedRow.getByRole("button", { name: `unlike ${first}`, exact: true }).click();
  await page.getByRole("button", { name: "undo" }).click();
  await expect(likedRow.getByRole("button", { name: `unlike ${first}`, exact: true })).toBeVisible();
});

test("an album heart fills the liked filter on the albums page", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-12");
  const name = (await page.getByRole("heading", { level: 1 }).textContent()) as string;
  await page.getByRole("button", { name: `like ${name}`, exact: true }).click();
  await expect(page.getByRole("button", { name: `unlike ${name}`, exact: true })).toBeVisible();
  await page.goto("/albums");
  await page.getByRole("button", { name: "liked" }).click();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: new RegExp(name) })
      .first(),
  ).toBeVisible();
});

test("ratings show once turned on and are saved", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-13");
  const titles = await trackTitles(page);
  await page.goto("/settings/appearance");
  await page.getByRole("switch", { name: "show ratings" }).click();
  await page.goto("/album/al-13");
  const rating = page.getByRole("group", { name: `rating for ${titles[0]}` });
  // The mock keeps ratings across tests and retries, and clicking the current rating clears it: pick one not set yet.
  const stars = (await rating.getByRole("button", { name: "4 stars" }).getAttribute("aria-pressed")) === "true" ? "3 stars" : "4 stars";
  // Reload only once the server has the rating: reloading mid-request would lose it.
  const saved = page.waitForResponse((response) => response.url().includes("/rest/setRating") && response.ok());
  await rating.getByRole("button", { name: stars }).click();
  await expect(rating.getByRole("button", { name: stars })).toHaveAttribute("aria-pressed", "true");
  await saved;
  await page.reload();
  await expect(page.getByRole("group", { name: `rating for ${titles[0]}` }).getByRole("button", { name: stars })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test.describe(() => {
  // The failure is injected with page.route, which doesn't see requests the service worker makes.
  test.use({ serviceWorkers: "block" });
  test("a like the server refuses flips back with an error", async ({ page, signedIn }) => {
    await signedIn.goto("/album/al-14");
    const titles = await trackTitles(page);
    await page.route("**/rest/star?*", (route) => route.fulfill({ status: 500, body: "" }));
    const row = page.getByRole("row", { name: new RegExp(titles[0] as string) }).first();
    await row.hover();
    await row.getByRole("button", { name: `like ${titles[0]}`, exact: true }).click();
    await expect(page.getByText(`couldn't like ${titles[0]}`)).toBeVisible();
    await expect(row.getByRole("button", { name: `like ${titles[0]}`, exact: true })).toHaveAttribute("aria-pressed", "false");
  });
});
