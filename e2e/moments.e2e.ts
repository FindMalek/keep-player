import type { Page } from "@playwright/test";
import { expect, fakeMediaClock, test, trackTitles } from "./fixtures";

// Moments belong to the account every test shares, and these two read the whole list: they run one after the other
// (never next to each other), and each starts from none, so a retry or a repeat sees the same page.
test.describe.configure({ mode: "serial" });

async function clearMoments(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const headers = { "x-keep-player": "1" };
    const { moments } = (await (await fetch("/api/moments", { headers })).json()) as { moments: { id: number }[] };
    for (const moment of moments) await fetch(`/api/moments/${moment.id}`, { method: "DELETE", headers });
  });
}

test("b saves a moment: a tick on the seek bar, a note on the moments page, search finds it, a link opens it there", async ({
  page,
  signedIn,
}) => {
  await page.addInitScript(fakeMediaClock);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await clearMoments(signedIn);
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
  await clearMoments(signedIn);
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
  // Newest song first; 30 s later the next moment starts.
  await expect(bar.getByRole("link", { name: titles[1] as string, exact: true })).toBeVisible();
  await page.locator("body").press("Shift+ArrowRight");
  await expect(bar.getByRole("link", { name: titles[0] as string, exact: true })).toBeVisible();
});
