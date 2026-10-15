import { expect, fakeMediaClock, test, trackTitles } from "./fixtures";

test("b saves a moment: a tick on the seek bar, a note on the moments page, search finds it, a link opens it there", async ({
  page,
  signedIn,
}) => {
  await page.addInitScript(fakeMediaClock);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signedIn.goto("/album/al-12");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.locator("body").press("5");
  await page.locator("body").press("b");
  await expect(page.getByText(/^saved a moment at \d+:\d\d in /)).toBeVisible();
  // The playing song's menu can copy a link at this point too.
  await page.locator("[aria-label=tracks] tbody tr").first().click({ button: "right" });
  await expect(page.getByRole("menu").getByRole("menuitem", { name: /^copy link at \d+:\d\d/ })).toBeVisible();
  await page.keyboard.press("Escape");
  const ticks = page.getByRole("contentinfo").getByRole("group", { name: "moments" });
  await expect(ticks.getByRole("button", { name: /^moment at / })).toHaveCount(1);

  await page.locator("body").press("g");
  await page.locator("body").press("m");
  await expect(page).toHaveURL(/\/moments$/);
  const note = page.getByRole("button", { name: /^note for the moment at / }).first();
  await note.click();
  await page.keyboard.type("the drop");
  await page.keyboard.press("Enter");
  await expect(ticks.getByRole("button", { name: /: the drop$/ })).toHaveCount(1);

  // Search by the note.
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill('moment:"the drop"');
  await expect(dialog.getByRole("group", { name: "songs" }).getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Escape");

  // The link opens the album and plays from that point.
  const row = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: /: the drop, click to edit$/ }) });
  await row.hover();
  await row.getByRole("button", { name: "copy link" }).click();
  await expect(page.getByText("link copied")).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/song\/[^?]+\?t=\d+$/);
  const at = Number(new URL(link).searchParams.get("t"));
  await page.goto(new URL(link).pathname + new URL(link).search);
  await expect(page).toHaveURL(/\/album\//);
  await expect
    .poll(async () => {
      const [m, s] = ((await page.locator("[data-slot=audio-player-time][data-type=current]").textContent()) ?? "0:0").split(":");
      return Number(m) * 60 + Number(s);
    })
    .toBeGreaterThanOrEqual(at);
});

test("the highlight reel plays each moment in turn", async ({ page, signedIn }) => {
  await page.addInitScript(fakeMediaClock);
  await signedIn.goto("/album/al-13");
  const titles = await trackTitles(page);
  const rows = page.locator("[aria-label=tracks] tbody tr");
  for (const index of [0, 1]) {
    await rows.nth(index).dblclick();
    await expect(page.getByRole("contentinfo")).toContainText(titles[index] as string);
    await page.locator("body").press("3");
    await page.locator("body").press("b");
    await expect(page.getByText(new RegExp(`^saved a moment at .* in ${titles[index]}$`))).toBeVisible();
  }
  await page.goto("/moments");
  await page.getByRole("button", { name: "play the highlight reel" }).click();
  const bar = page.getByRole("contentinfo");
  const title = bar.getByRole("link").first();
  // Other tests save moments too, so which song comes first isn't known: 30 s on, the next one starts.
  await expect(bar.getByRole("button", { name: "pause" })).toBeVisible();
  const first = await title.textContent();
  await page.locator("body").press("Shift+ArrowRight");
  await expect(title).not.toHaveText(first ?? "");
});
