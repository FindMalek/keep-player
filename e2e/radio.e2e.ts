import { expect, fakeMediaClock, test, trackTitles } from "./fixtures";

test("radio from a song: it starts with that song, keeps 10 ahead as it plays, and tunes with 👍 / 👎 / ban", async ({
  page,
  signedIn,
}) => {
  await page.addInitScript(fakeMediaClock);
  await signedIn.goto("/album/al-21");
  const titles = await trackTitles(page);
  await page
    .getByRole("row", { name: titles[0] as string })
    .first()
    .click({ button: "right" });
  await page.getByRole("menu").getByRole("menuitem", { name: "start radio" }).click();
  const bar = page.getByRole("contentinfo");
  await expect(bar.getByRole("link", { name: titles[0] as string, exact: true })).toBeVisible();

  await page.keyboard.press("q");
  const panel = page.getByRole("complementary", { name: "queue" });
  const radio = panel.getByRole("region", { name: "radio" });
  await expect(radio).toContainText(`${titles[0]} radio`);
  const upcoming = panel.getByRole("list", { name: "queue" }).locator("[data-queue-index]");

  // Endless: skipping ahead refills it.
  for (let i = 0; i < 7; i++) await page.locator("body").press("n");
  await expect.poll(async () => (await panel.getByText(/radio$/).count()) > 0).toBe(true);
  await expect.poll(async () => upcoming.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(10);

  // 👎 skips the song and it never comes back on this station.
  const before = await bar.getByRole("link").first().textContent();
  await radio.getByRole("button", { name: /^not for this station: / }).click();
  await expect(bar.getByRole("link").first()).not.toHaveText(before ?? "");

  // 👍 marks it, the locks toggle, the variety slider is there.
  await radio.getByRole("button", { name: /^more like / }).click();
  await expect(radio.getByRole("button", { name: /^more like / })).toHaveAttribute("aria-pressed", "true");
  await radio.getByRole("button", { name: "artist lock" }).click();
  await expect(radio.getByRole("button", { name: "artist lock" })).toHaveAttribute("aria-pressed", "true");
  await expect(radio.getByRole("slider", { name: "variety" })).toBeVisible();

  // Ban: never on any radio, kept on the server.
  const banned = await bar.getByRole("link").first().textContent();
  await radio.getByRole("button", { name: /^never play .* on radio$/ }).click();
  await expect(page.getByText(`${banned} won't play on radio again`)).toBeVisible();
  const bans = await page.evaluate(
    async () => (await (await fetch("/api/radio/bans", { headers: { "x-keep-player": "1" } })).json()).songs,
  );
  expect(bans.map((song: { title: string }) => song.title)).toContain(banned);

  // Stop: the queue stays, the strip offers a radio from it instead.
  await radio.getByRole("button", { name: "stop radio" }).click();
  await expect(panel.getByRole("button", { name: "radio from your queue" })).toBeVisible();
});

test("a genre page starts that genre's radio", async ({ page, signedIn }) => {
  await signedIn.goto("/genre/Rock");
  await page.getByRole("button", { name: "rock radio" }).click();
  await page.keyboard.press("q");
  await expect(page.getByRole("complementary", { name: "queue" }).getByRole("region", { name: "radio" })).toContainText("Rock radio");
});
