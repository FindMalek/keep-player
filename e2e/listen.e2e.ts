import { expect, fakeMediaClock, signIn, test } from "./fixtures";

test("a listener follows the host: same song and play state, and hears when the host ends it", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await page.addInitScript(fakeMediaClock);
  await signIn(page);

  await page.goto("/listen");
  await page.getByLabel("anyone can skip before starting").click();
  await page.getByRole("button", { name: "start a session" }).click();
  const link = await page.getByLabel("session link").inputValue();
  expect(link).toMatch(/\/listen\/[a-z0-9]{6}$/);

  const guest = await browser.newContext();
  const other = await guest.newPage();
  await other.addInitScript(fakeMediaClock);
  await other.addInitScript(() => {
    localStorage.setItem("keep-player:onboarded", "test");
    localStorage.setItem("keep-player:settings", JSON.stringify({ queueSync: false }));
  });
  await signIn(other);
  await other.goto(new URL(link).pathname);
  await expect(other.getByRole("button", { name: "leave" })).toBeVisible();

  // The host plays an album; the listener's player bar shows the same song and is playing.
  await page.goto("/albums");
  await page.locator('a[href^="/album/"]').first().click();
  await page.getByRole("button", { name: "play", exact: true }).click();
  const hostBar = page.getByRole("contentinfo");
  await expect(hostBar.getByRole("button", { name: "pause" })).toBeVisible();
  const guestBar = other.getByRole("contentinfo");
  await expect(guestBar.getByRole("button", { name: "pause" })).toBeVisible({ timeout: 10_000 });

  await hostBar.getByRole("button", { name: "pause" }).click();
  await expect(guestBar.getByRole("button", { name: "play", exact: true })).toBeVisible({ timeout: 10_000 });

  await page.goto("/listen");
  await page.getByRole("button", { name: "end session" }).click();
  await expect(other.getByText("the host ended the session")).toBeVisible();
  await guest.close();
});

test("in party mode only the host plays; a listener's pause button pauses the host", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await page.addInitScript(fakeMediaClock);
  await signIn(page);
  await page.goto("/listen");
  await page.getByLabel("anyone can skip before starting").click();
  await page.getByLabel("party mode before starting").click();
  await page.getByRole("button", { name: "start a session" }).click();
  const link = await page.getByLabel("session link").inputValue();

  const guest = await browser.newContext();
  const other = await guest.newPage();
  await other.addInitScript(fakeMediaClock);
  await other.addInitScript(() => {
    localStorage.setItem("keep-player:onboarded", "test");
    localStorage.setItem("keep-player:settings", JSON.stringify({ queueSync: false }));
  });
  await signIn(other);
  await other.goto(new URL(link).pathname);
  await expect(other.getByText(/party mode: the host's device plays/)).toBeVisible();

  await page.goto("/albums");
  await page.locator('a[href^="/album/"]').first().click();
  await page.getByRole("button", { name: "play", exact: true }).click();
  const hostBar = page.getByRole("contentinfo");
  await expect(hostBar.getByRole("button", { name: "pause" })).toBeVisible();

  // The listener shows the host playing.
  const guestBar = other.getByRole("contentinfo");
  await expect(guestBar.getByRole("button", { name: "pause" })).toBeVisible({ timeout: 10_000 });

  await guestBar.getByRole("button", { name: "pause" }).click();
  await expect(hostBar.getByRole("button", { name: "play", exact: true })).toBeVisible({ timeout: 10_000 });
  await guest.close();
});
