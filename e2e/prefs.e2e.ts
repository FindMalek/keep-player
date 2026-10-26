import type { Page } from "@playwright/test";
import { expect, fakeMediaClock, test, trackTitles } from "./fixtures";

// The rules are per account and these tests need the real server (the fixture stubs it for everyone else): they run
// one after the other and each leaves nothing behind.
test.describe.configure({ mode: "serial" });

async function realPrefs(page: Page): Promise<void> {
  await page.unroute("**/api/prefs**");
}

async function reset(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const headers = { "x-keep-player": "1", "content-type": "application/json" };
    const prefs = (await (await fetch("/api/prefs", { headers })).json()) as { songs: { id: string }[]; albums: { id: string }[] };
    for (const song of prefs.songs)
      await fetch(`/api/prefs/songs/${song.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ trimStart: null, trimEnd: null, never: false, hidden: false }),
      });
    for (const album of prefs.albums)
      await fetch(`/api/prefs/albums/${album.id}`, { method: "PUT", headers, body: JSON.stringify({ keepOrder: false, never: false }) });
  });
}

test("⌥[ starts a song later and ⌥] ends it early, for good, and the list marks it", async ({ page, signedIn }) => {
  await realPrefs(page);
  await page.addInitScript(fakeMediaClock);
  await signedIn.goto("/album/al-31");
  await reset(signedIn);
  const titles = await trackTitles(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.locator("body").press("2");
  const bar = page.getByRole("contentinfo");
  await page.locator("body").press("Alt+[");
  await expect(page.getByText(new RegExp(`^${titles[0]} now starts at \\d+:\\d\\d$`))).toBeVisible();
  const prefs = await page.evaluate(async () => (await (await fetch("/api/prefs", { headers: { "x-keep-player": "1" } })).json()).songs);
  const start = prefs[0].trimStart as number;
  expect(start).toBeGreaterThan(10);

  await page.locator("body").press("n");
  await page
    .getByRole("row", { name: titles[0] as string })
    .first()
    .dblclick();
  await expect(bar.getByRole("link", { name: titles[0] as string, exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const [m, s] = ((await page.locator("[data-slot=audio-player-time][data-type=current]").textContent()) ?? "0:0").split(":");
      return Number(m) * 60 + Number(s);
    })
    .toBeGreaterThanOrEqual(Math.floor(start));
  await expect(
    page
      .getByRole("row", { name: titles[0] as string })
      .first()
      .getByLabel("trimmed"),
  ).toBeVisible();

  await page.locator("body").press("5");
  await page.locator("body").press("Alt+]");
  await expect(page.getByText(new RegExp(`^${titles[0]} now ends at \\d+:\\d\\d$`))).toBeVisible();
  await expect(bar.getByRole("link", { name: titles[1] as string, exact: true })).toBeVisible({ timeout: 5000 });

  await page.locator("body").press("ControlOrMeta+z");
  await expect(page.getByText(/^undid: /)).toBeVisible();
  await reset(page);
});

test("hide a song: gone from other lists, still on its album, and settings brings it back", async ({ page, signedIn }) => {
  await realPrefs(page);
  await signedIn.goto("/album/al-32");
  await reset(signedIn);
  const titles = await trackTitles(page);
  const hideTitle = titles[1] as string;

  // On a list that isn't an album (the liked songs) the hidden song disappears at once.
  await page.getByRole("row", { name: hideTitle }).first().click({ button: "right" });
  await page.getByRole("menu").getByRole("menuitem", { name: "like" }).click();
  await page.goto("/liked");
  const liked = page.getByRole("row", { name: hideTitle }).first();
  await expect(liked).toBeVisible();
  await liked.click({ button: "right" });
  await page.getByRole("menu").getByRole("menuitem", { name: "hide song" }).click();
  await expect(page.getByRole("row", { name: hideTitle })).toHaveCount(0);

  await page.goto("/album/al-32");
  await expect(page.getByRole("row", { name: hideTitle }).first().getByLabel("hidden")).toBeVisible();

  await page
    .getByRole("row", { name: titles[2] as string })
    .first()
    .click({ button: "right" });
  await page.getByRole("menu").getByRole("menuitem", { name: "never in shuffle or radio" }).click();
  await expect(
    page
      .getByRole("row", { name: titles[2] as string })
      .first()
      .getByLabel("never in shuffle or radio"),
  ).toBeVisible();

  await page.goto("/settings/library");
  const rules = page.getByRole("list", { name: "library rules" });
  await expect(rules.getByRole("listitem").filter({ hasText: hideTitle })).toContainText("hidden: shows only on its album");
  await rules.getByRole("listitem").filter({ hasText: hideTitle }).getByRole("button", { name: "unhide" }).click();
  await expect(rules.getByRole("listitem").filter({ hasText: hideTitle })).toHaveCount(0);
  await rules
    .getByRole("listitem")
    .filter({ hasText: titles[2] as string })
    .getByRole("button", { name: "allow" })
    .click();
  await expect(page.getByText(/nothing set/)).toBeVisible();

  await page.goto("/liked");
  await expect(page.getByRole("row", { name: hideTitle }).first()).toBeVisible();
  await page.getByRole("row", { name: hideTitle }).first().click({ button: "right" });
  await page.getByRole("menu").getByRole("menuitem", { name: "unlike" }).click();
});

test("the keep-in-order flag of an album is saved for the account", async ({ page, signedIn }) => {
  await realPrefs(page);
  await signedIn.goto("/album/al-33");
  await reset(signedIn);
  await page
    .getByRole("heading", { level: 1 })
    .click({ button: "right" })
    .catch(() => undefined);
  const prefs = await page.evaluate(async () => {
    const headers = { "x-keep-player": "1", "content-type": "application/json" };
    await fetch("/api/prefs/albums/al-33", { method: "PUT", headers, body: JSON.stringify({ name: "test album", keepOrder: true }) });
    return (await (await fetch("/api/prefs", { headers })).json()).albums;
  });
  expect(prefs).toEqual([{ id: "al-33", name: "test album", keepOrder: true, never: false }]);
  await reset(page);
});
