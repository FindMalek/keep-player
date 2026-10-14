import { expect, fakeMediaClock, test, trackTitles } from "./fixtures";

test("i opens everything about the song, down to its folder", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-23");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.locator("body").press("i");
  const info = page.getByRole("complementary", { name: "info" });
  await expect(info.getByText("44.1 kHz")).toBeVisible();
  await expect(info.getByText(/\.mp3$/)).toBeVisible();
  await expect(info.getByText("replaygain")).toBeVisible();
  await info.getByRole("link", { name: "open folder" }).click();
  await expect(page).toHaveURL(/\/folders\/al-23$/);
});

test("the tab says what's playing, and the last 15 s show what's next with a way to skip it", async ({ page, signedIn }) => {
  await page.addInitScript(fakeMediaClock);
  await signedIn.goto("/album/al-23");
  const titles = await trackTitles(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await expect(page).toHaveTitle(new RegExp(`^▶ ${titles[0]}`));
  await expect(page.locator("link[rel=icon]")).toHaveAttribute("href", /M4\.5/);

  // Into the last 15 s with the seek keys: 30 s steps while far, 5 s steps close in.
  const times = page.locator("[data-slot=audio-player-time]");
  const seconds = (text: string | null) => (text ?? "0:00").split(":").reduce((total, part) => total * 60 + Number(part), 0);
  const left = async () => seconds(await times.nth(1).textContent()) - seconds(await times.nth(0).textContent());
  for (let step = 0; step < 80 && (await left()) > 14; step += 1) {
    await page.locator("body").press((await left()) > 45 ? "Shift+ArrowRight" : "ArrowRight");
    await page.waitForTimeout(50);
  }
  const peek = page.getByRole("status").filter({ hasText: "up next" });
  await expect(peek).toContainText(titles[1] as string);
  await peek.getByRole("button", { name: "skip it" }).click();
  await expect(page.getByText(`removed ${titles[1]} from the queue`)).toBeVisible();
});

test("full screen shows the next songs and hides its controls when you stop moving", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-23");
  const titles = await trackTitles(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.locator("body").press("Shift+F");
  const view = page.getByRole("dialog", { name: titles[0] as string });
  await expect(view.getByRole("region", { name: "up next" })).toContainText(titles[1] as string);
  await expect(view.getByRole("button", { name: "pause" })).toBeVisible();
  await expect(view).toHaveAttribute("data-idle", "true", { timeout: 6000 });
  await page.mouse.move(200, 200);
  await page.mouse.move(220, 220);
  await expect(view).not.toHaveAttribute("data-idle", "true");
});
