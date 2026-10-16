import type { Page } from "@playwright/test";
import { appShortcuts } from "../src/web/app-shortcuts";
import { expect, fakeMediaClock, test, trackTitles } from "./fixtures";

/*
 * One test per shortcut in the registry, generated from it. A shortcut without an expectation below fails the suite,
 * so new shortcuts can't ship untested.
 */
const noop = () => undefined;
const SHORTCUTS = appShortcuts(new Proxy({}, { get: () => noop }) as never);

/** "shift+arrowright" → "Shift+ArrowRight", "mod+k" → "ControlOrMeta+k", chords → one press per step. */
function keystrokes(binding: string): string[] {
  const names: Record<string, string> = {
    shift: "Shift",
    alt: "Alt",
    ctrl: "Control",
    mod: "ControlOrMeta",
    space: "Space",
    arrowright: "ArrowRight",
    arrowleft: "ArrowLeft",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    escape: "Escape",
    enter: "Enter",
    backspace: "Backspace",
    delete: "Delete",
    home: "Home",
    end: "End",
  };
  return binding.split(" ").map((step) =>
    step
      .split("+")
      .map((part) => names[part] ?? part)
      .join("+"),
  );
}

const bar = (page: Page) => page.getByRole("contentinfo");
const seconds = (text: string | null) => (text ?? "0:00").split(":").reduce((total, part) => total * 60 + Number(part), 0);
const elapsed = async (page: Page) => seconds(await page.locator("[data-slot=audio-player-time][data-type=current]").textContent());
const duration = async (page: Page) => seconds(await page.locator("[data-slot=audio-player-time][data-type=duration]").textContent());
const volume = async (page: Page) =>
  Number.parseInt((await page.locator("input[aria-label=Volume]").getAttribute("aria-valuetext")) ?? "0", 10);

/** Start mid-song so seeking both ways is visible. */
async function midSong(page: Page): Promise<void> {
  await page.locator("body").press("5");
  await expect.poll(() => elapsed(page)).toBeGreaterThan(60);
}

// The trim shortcuts change the account's rules; the fixture stubs the server, so nothing outlives the test.
const undoTrim = (page: Page) => page.locator("body").press("ControlOrMeta+z");

const focusRow = async (page: Page, index = 0) => page.locator("[aria-label=tracks] tbody tr[data-song-index]").nth(index).focus();
const focused = (page: Page) => page.evaluate(() => document.activeElement?.closest("[data-song-index]")?.getAttribute("data-song-index"));
const selection = (page: Page) => page.getByRole("toolbar", { name: "selection" });

type Check = (page: Page, press: () => Promise<void>, titles: string[]) => Promise<void>;

const CHECKS: Record<string, Check> = {
  "play-pause": async (page, press) => {
    await press();
    await expect(bar(page).getByRole("button", { name: "play", exact: true })).toBeVisible();
  },
  "seek-forward": async (page, press) => {
    const before = await elapsed(page);
    await press();
    await expect.poll(() => elapsed(page)).toBeGreaterThanOrEqual(before + 4);
  },
  "seek-back": async (page, press) => {
    await midSong(page);
    const before = await elapsed(page);
    await press();
    await expect.poll(() => elapsed(page)).toBeLessThanOrEqual(before - 3);
  },
  "seek-forward-far": async (page, press) => {
    const before = await elapsed(page);
    await press();
    await expect.poll(() => elapsed(page)).toBeGreaterThanOrEqual(before + 29);
  },
  "seek-back-far": async (page, press) => {
    await midSong(page);
    const before = await elapsed(page);
    await press();
    await expect.poll(() => elapsed(page)).toBeLessThanOrEqual(before - 28);
  },
  "nudge-forward": async (page, press) => {
    await midSong(page);
    const before = await elapsed(page);
    for (let i = 0; i < 4; i += 1) await press();
    await expect.poll(() => elapsed(page)).toBeGreaterThanOrEqual(before + 3);
  },
  "nudge-back": async (page, press) => {
    await midSong(page);
    const before = await elapsed(page);
    for (let i = 0; i < 4; i += 1) await press();
    await expect.poll(() => elapsed(page)).toBeLessThanOrEqual(before - 2);
  },
  next: async (page, press, titles) => {
    await press();
    await expect(bar(page).getByRole("link", { name: titles[1] as string })).toBeVisible();
  },
  previous: async (page, press, titles) => {
    await page.locator("body").press("n");
    await expect(bar(page).getByRole("link", { name: titles[1] as string })).toBeVisible();
    await press();
    await expect(bar(page).getByRole("link", { name: titles[0] as string })).toBeVisible();
  },
  "volume-up": async (page, press) => {
    await page.locator("body").press("ArrowDown");
    await page.locator("body").press("ArrowDown");
    const before = await volume(page);
    await press();
    await expect.poll(() => volume(page)).toBeGreaterThan(before);
  },
  "volume-down": async (page, press) => {
    const before = await volume(page);
    await press();
    await expect.poll(() => volume(page)).toBeLessThan(before);
  },
  mute: async (page, press) => {
    await press();
    await expect(bar(page).getByRole("button", { name: "Unmute" })).toBeVisible();
  },
  shuffle: async (page, press) => {
    await press();
    await expect(bar(page).getByRole("button", { name: "shuffle" })).toHaveAttribute("aria-pressed", "true");
  },
  repeat: async (page, press) => {
    await press();
    await expect(bar(page).getByRole("button", { name: "repeat all" })).toBeVisible();
  },
  "stop-after": async (page, press) => {
    await press();
    // At this window width the sleep timer lives in the bar's "more" menu, whose button shows the timer is on.
    await expect(bar(page).getByRole("button", { name: "more controls" })).toHaveAttribute("aria-pressed", "true");
  },
  queue: async (page, press) => {
    await press();
    await expect(page.getByRole("complementary", { name: "queue" })).toBeVisible();
  },
  lyrics: async (page, press) => {
    await press();
    await expect(page.getByRole("complementary", { name: "lyrics" })).toBeVisible();
  },
  "full-screen": async (page, press, titles) => {
    await press();
    await expect(page.getByRole("dialog", { name: titles[0] as string })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  },
  info: async (page, press) => {
    await press();
    await expect(page.getByRole("complementary", { name: "info" })).toBeVisible();
  },
  "mini-player": async (page, press) => {
    await press();
    // Headless Chromium may or may not offer Document PiP: either the window opens or the app says it can't.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Boolean((window as unknown as { documentPictureInPicture?: { window: Window | null } }).documentPictureInPicture?.window) ||
            document.body.innerText.includes("the mini player needs"),
        ),
      )
      .toBe(true);
  },
  close: async (page, press) => {
    await page.locator("body").press("q");
    await expect(page.getByRole("complementary", { name: "queue" })).toBeVisible();
    await press();
    await expect(page.getByRole("complementary", { name: "queue" })).toHaveCount(0);
  },
  search: async (page, press) => {
    await press();
    await expect(page.getByRole("dialog", { name: "search" })).toBeVisible();
  },
  like: async (page, press, titles) => {
    await page.getByRole("button", { name: "play", exact: true }).first().click();
    const bar = page.getByRole("contentinfo");
    await expect(bar.getByRole("button", { name: `like ${titles[0]}`, exact: true })).toBeVisible();
    await press();
    await expect(bar.getByRole("button", { name: `unlike ${titles[0]}`, exact: true })).toBeVisible();
    await press();
    await expect(bar.getByRole("button", { name: `like ${titles[0]}`, exact: true })).toBeVisible();
  },
  "find-in-list": async (page, press, titles) => {
    await press();
    const filter = page.getByRole("textbox", { name: "filter this list" });
    await expect(filter).toBeFocused();
    await filter.fill(titles[1] as string);
    await expect(
      page
        .getByRole("main")
        .getByRole("row")
        .filter({ hasText: titles[1] as string })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("row")
        .filter({ hasText: titles[2] as string }),
    ).toHaveCount(0);
    await filter.press("Escape");
    await expect(filter).toHaveCount(0);
  },
  "new-playlist": async (page, press) => {
    await press();
    await expect(page.getByRole("dialog", { name: "new playlist" })).toBeVisible();
    await page.keyboard.press("Escape");
  },
  undo: async (page, press) => {
    // The like is recorded once the server took it.
    const starred = page.waitForResponse(/\/rest\/star/);
    await page.locator("body").press("f");
    await starred;
    await press();
    await expect(page.getByText(/^undid: liked /)).toBeVisible();
  },
  redo: async (page, press) => {
    const starred = page.waitForResponse(/\/rest\/star/);
    await page.locator("body").press("f");
    await starred;
    await page.locator("body").press("ControlOrMeta+z");
    await expect(page.getByText(/^undid: liked /)).toBeVisible();
    await press();
    await expect(page.getByText(/^redid: liked /)).toBeVisible();
  },
  "cheat-sheet": async (page, press) => {
    await press();
    await expect(page.getByRole("dialog", { name: "keyboard shortcuts" })).toBeVisible();
  },
  "go-home": async (page, press) => {
    await press();
    await expect(page).toHaveURL(/\/$/);
  },
  "go-albums": async (page, press) => {
    await press();
    await expect(page).toHaveURL(/\/albums$/);
  },
  "go-artists": async (page, press) => {
    await press();
    await expect(page).toHaveURL(/\/artists$/);
  },
  "go-songs": async (page, press) => {
    await press();
    await expect(page).toHaveURL(/\/songs$/);
  },
  "go-genres": async (page, press) => {
    await press();
    await expect(page).toHaveURL(/\/genres$/);
  },
  moment: async (page, press) => {
    await press();
    await expect(page.getByText(/^saved a moment at \d+:\d\d in /)).toBeVisible();
  },
  "trim-start": async (page, press) => {
    await midSong(page);
    await press();
    await expect(page.getByText(/ now starts at \d+:\d\d$/)).toBeVisible();
    await undoTrim(page);
  },
  "trim-end": async (page, press) => {
    await midSong(page);
    await press();
    await expect(page.getByText(/ now ends at \d+:\d\d$/)).toBeVisible();
    await undoTrim(page);
  },
  "copy-link": async (page, press) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await midSong(page);
    await press();
    await expect(page.getByText(/^copied a link to /)).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/song\/[^?]+\?t=\d+$/);
  },
  "go-moments": async (page, press) => {
    await press();
    await expect(page).toHaveURL(/\/moments$/);
  },
  "go-history": async (page, press) => {
    await press();
    await expect(page).toHaveURL(/\/history$/);
  },
  "go-stats": async (page, press) => {
    await press();
    await expect(page).toHaveURL(/\/stats$/);
  },
  "go-liked": async (page, press) => {
    await press();
    await expect(page).toHaveURL(/\/liked$/);
  },
  "go-folders": async (page, press) => {
    await press();
    await expect(page).toHaveURL(/\/folders$/);
  },
  "go-queue": async (page, press) => {
    await press();
    await expect(page.getByRole("complementary", { name: "queue" })).toBeVisible();
  },
  back: async (page, press) => {
    await page.locator("body").press("g");
    await page.locator("body").press("a");
    await expect(page).toHaveURL(/\/albums$/);
    await press();
    await expect(page).toHaveURL(/\/album\/al-3$/);
  },
  forward: async (page, press) => {
    await page.locator("body").press("g");
    await page.locator("body").press("a");
    await page.goBack();
    await expect(page).toHaveURL(/\/album\/al-3$/);
    await press();
    await expect(page).toHaveURL(/\/albums$/);
  },
  sidebar: async (page, press) => {
    await press();
    await expect(page.locator("[data-slot=sidebar][data-state]")).toHaveAttribute("data-state", "collapsed");
  },
  "list-down": async (page, press) => {
    await focusRow(page);
    await press();
    await expect.poll(() => focused(page)).toBe("1");
  },
  "list-up": async (page, press) => {
    await focusRow(page, 2);
    await press();
    await expect.poll(() => focused(page)).toBe("1");
  },
  "list-left": async (page, press) => {
    await page.goto("/albums");
    await page.locator("[data-grid-index] a").nth(2).focus();
    await press();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest("[data-grid-index]")?.getAttribute("data-grid-index")))
      .toBe("1");
  },
  "list-right": async (page, press) => {
    await page.goto("/albums");
    await page.locator("[data-grid-index] a").first().focus();
    await press();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest("[data-grid-index]")?.getAttribute("data-grid-index")))
      .toBe("1");
  },
  "list-first": async (page, press) => {
    await focusRow(page, 3);
    await press();
    await expect.poll(() => focused(page)).toBe("0");
  },
  "list-last": async (page, press, titles) => {
    await focusRow(page);
    await press();
    await expect.poll(() => focused(page)).toBe(String(titles.length - 1));
  },
  "list-extend-down": async (page, press) => {
    await focusRow(page);
    await press();
    await expect(selection(page)).toContainText("2 selected");
  },
  "list-extend-up": async (page, press) => {
    await focusRow(page, 2);
    await press();
    await expect(selection(page)).toContainText("2 selected");
  },
  "list-toggle": async (page, press) => {
    await focusRow(page);
    await press();
    await expect(selection(page)).toContainText("1 selected");
  },
  "list-select-all": async (page, press, titles) => {
    await focusRow(page);
    await press();
    await expect(selection(page)).toContainText(`${titles.length} selected`);
  },
  "list-clear": async (page, press) => {
    await focusRow(page);
    await page.keyboard.press("x");
    await expect(selection(page)).toBeVisible();
    await press();
    await expect(selection(page)).toHaveCount(0);
  },
  "list-play": async (page, press, titles) => {
    await focusRow(page, 3);
    await press();
    await expect(bar(page).getByRole("link", { name: titles[3] as string })).toBeVisible();
  },
  "list-play-next": async (page, press, titles) => {
    await focusRow(page, 5);
    await press();
    await page.locator("body").press("n");
    await expect(bar(page).getByRole("link", { name: titles[5] as string })).toBeVisible();
  },
  "list-queue": async (page, press) => {
    await focusRow(page, 5);
    await press();
    await page.locator("body").press("q");
    await expect(page.getByRole("complementary", { name: "queue" }).getByText("next in your queue")).toBeVisible();
  },
  "list-open": async (page, press) => {
    await focusRow(page);
    await press();
    await expect(page).toHaveURL(/\/artist\//);
  },
  "list-remove": async (page, press, titles) => {
    await page.locator("body").press("q");
    const queue = page.getByRole("list", { name: "queue" });
    await queue.locator("[data-queue-index]").nth(1).locator("button").first().focus();
    await press();
    await expect(queue.getByText(titles[1] as string, { exact: true })).toHaveCount(0);
  },
  "list-move-up": async (page, press, titles) => {
    await page.locator("body").press("q");
    const rows = page.getByRole("list", { name: "queue" }).locator("[data-queue-index]");
    await rows.nth(2).locator("button").first().focus();
    await press();
    await expect(rows.nth(1)).toContainText(titles[2] as string);
  },
  "list-move-down": async (page, press, titles) => {
    await page.locator("body").press("q");
    const rows = page.getByRole("list", { name: "queue" }).locator("[data-queue-index]");
    await rows.nth(1).locator("button").first().focus();
    await press();
    await expect(rows.nth(2)).toContainText(titles[1] as string);
  },
};

test("every registry shortcut has a test here", () => {
  const missing = SHORTCUTS.map((shortcut) => shortcut.id).filter((id) => !id.startsWith("jump-") && !CHECKS[id]);
  expect(missing).toEqual([]);
});

test.describe("each shortcut does what it says", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(fakeMediaClock);
  });

  for (const shortcut of SHORTCUTS) {
    const check = CHECKS[shortcut.id];
    const binding = shortcut.keys[0];
    if (!check || !binding) continue;
    test(`${shortcut.id} (${binding})`, async ({ page, signedIn }) => {
      await signedIn.goto("/album/al-3");
      const titles = await trackTitles(page);
      await page.getByRole("button", { name: "play", exact: true }).first().click();
      await expect(bar(page).getByRole("button", { name: "pause" })).toBeVisible();
      const press = async () => {
        for (const stroke of keystrokes(binding)) await page.keyboard.press(stroke);
      };
      await check(page, press, titles);
    });
  }

  test("jump 0–9 (each digit lands at that tenth of the song)", async ({ page, signedIn }) => {
    await signedIn.goto("/album/al-3");
    await page.getByRole("button", { name: "play", exact: true }).first().click();
    const total = await duration(page);
    for (const digit of [7, 3, 0]) {
      await page.locator("body").press(String(digit));
      await expect.poll(() => elapsed(page)).toBeGreaterThanOrEqual(Math.floor((total * digit) / 10) - 1);
      expect(await elapsed(page)).toBeLessThanOrEqual(Math.ceil((total * digit) / 10) + 3);
    }
  });

  test("space on a focused button doesn't also click it", async ({ page, signedIn }) => {
    await signedIn.goto("/album/al-3");
    await page.getByRole("button", { name: "play", exact: true }).first().click();
    const shuffle = bar(page).getByRole("button", { name: "shuffle" });
    await shuffle.focus();
    await page.keyboard.press("Space");
    await expect(bar(page).getByRole("button", { name: "play", exact: true })).toBeVisible();
    await expect(shuffle).toHaveAttribute("aria-pressed", "false");
  });
});
