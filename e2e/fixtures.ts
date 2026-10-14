import { test as base, expect, type Page } from "@playwright/test";

export async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("username").fill("demo");
  await page.getByLabel("password").fill("demo");
  await page.getByRole("button", { name: "sign in" }).click();
  await expect(page.getByRole("link", { name: "albums", exact: true })).toBeVisible();
}

export const test = base.extend<{ signedIn: Page }>({
  signedIn: async ({ page }, use) => {
    await signIn(page);
    await use(page);
  },
});

export { expect };

/**
 * Headless Chromium has no audio output, so a playing <audio> never advances `currentTime`. This makes media time move in
 * real time while playing (and honors seeks), which is all the app reads from the element.
 */
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
  // The app's <audio> isn't in the document, so watch each element directly once it starts playing.
  const play = HTMLMediaElement.prototype.play;
  // Every element that ever played, so tests can count how many are playing at once.
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
