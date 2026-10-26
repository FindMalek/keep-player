import { test as base, expect, type Page } from "@playwright/test";

export async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("username").fill("demo");
  await page.getByLabel("password").fill("demo");
  await page.getByRole("button", { name: "sign in" }).click();
  await expect(page.getByRole("link", { name: "albums", exact: true })).toBeVisible();
}

export const test = base.extend<{ signedIn: Page }>({
  // Every test shares the mock's one play queue, so the queue hand-off stays off unless a test turns it on.
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const key = "keep-player:settings";
      const settings = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
      if (!("queueSync" in settings)) localStorage.setItem(key, JSON.stringify({ ...settings, queueSync: false }));
      if (localStorage.getItem("keep-player:onboarded") === null) localStorage.setItem("keep-player:onboarded", "test");
    });
    // Playback rules and synced settings are per account, which every test shares: each test starts with none.
    await page.route("**/api/prefs**", (route) => route.fulfill({ json: { songs: [], albums: [] } }));
    await page.route("**/api/settings", (route) =>
      route.fulfill({ json: route.request().method() === "GET" ? { settings: null, updated: 0 } : { ok: true } }),
    );
    await use(page);
  },
  signedIn: async ({ page }, use) => {
    await signIn(page);
    await use(page);
  },
});

export { expect };

/** Headless Chromium never advances <audio> `currentTime`; this moves media time in real time while playing. */
export function fakeMediaClock(): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
  if (!descriptor?.get || !descriptor.set) return;
  const { get, set } = descriptor;
  const clock = new WeakMap<HTMLMediaElement, { base: number; since: number | null; watched?: boolean }>();
  const state = (media: HTMLMediaElement) => {
    const value = clock.get(media) ?? { base: 0, since: null };
    clock.set(media, value);
    return value;
  };
  const now = (media: HTMLMediaElement) => {
    const value = state(media);
    return value.base + (value.since === null ? 0 : (performance.now() - value.since) / 1000);
  };
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return Math.max(get.call(this), now(this));
    },
    set(this: HTMLMediaElement, seconds: number) {
      const value = state(this);
      value.base = seconds;
      if (value.since !== null) value.since = performance.now();
      set.call(this, seconds);
    },
  });
  const play = HTMLMediaElement.prototype.play;
  const elements = new Set<HTMLMediaElement>();
  (window as unknown as { __playingMedia: () => number }).__playingMedia = () => [...elements].filter((media) => !media.paused).length;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    elements.add(this);
    const value = state(this);
    if (!value.watched) {
      value.watched = true;
      this.addEventListener("playing", () => Object.assign(state(this), { since: performance.now() }));
      this.addEventListener("pause", () => Object.assign(state(this), { base: now(this), since: null }));
    }
    return play.call(this);
  };
}

export async function trackTitles(page: Page): Promise<string[]> {
  const cells = page.locator("[aria-label=tracks] tbody tr td:nth-child(2) span:first-child");
  await expect(cells.first()).toBeVisible();
  return cells.allTextContents();
}
