import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, fakeMediaClock, test, trackTitles } from "./fixtures";

// One shared play queue on the mock: these run in order, and only here is the sync turned on.
test.describe.configure({ mode: "serial" });

const MOCK = process.env.E2E_MOCK_URL as string;
const AUTH = `u=demo&t=${createHash("md5").update("demosalt").digest("hex")}&s=salt&v=1.16.1&f=json`;

async function syncOn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const key = "keep-player:settings";
    const settings = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...settings, queueSync: true }));
  });
}

async function saveFromArpeggi(page: Page, ids: string[], index: number, positionMs: number): Promise<void> {
  const body = new URLSearchParams([
    ...ids.map((id) => ["id", id]),
    ["currentIndex", String(index)],
    ["position", String(positionMs)],
    ["c", "Arpeggi"],
  ]);
  await page.request.post(`${MOCK}/rest/savePlayQueueByIndex?${AUTH}`, {
    data: body.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

test("a queue paused on the phone is offered here and picks up at the same spot", async ({ page }) => {
  await syncOn(page);
  await page.addInitScript(fakeMediaClock);
  await saveFromArpeggi(page, ["so-30", "so-31", "so-32"], 1, 134_000);
  const { signIn } = await import("./fixtures");
  await signIn(page);
  const offer = page.getByText(/^continue from Arpeggi · .+ at 2:14$/);
  await expect(offer).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "resume here" }).click();
  const bar = page.getByRole("contentinfo");
  await expect(bar.locator("[data-slot=audio-player-time][data-type=current]")).toHaveText("2:14");
  await expect(bar.getByRole("button", { name: "play", exact: true })).toBeVisible();
});

test("playing here saves the queue as this browser, and keep mine is remembered", async ({ page, signedIn }) => {
  await syncOn(page);
  await signedIn.goto("/album/al-24");
  const titles = await trackTitles(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  // The sync starts a moment after the first screen; pause once it's listening.
  await page.waitForTimeout(2500);
  await page.locator("body").press("Space");
  await expect
    .poll(async () => {
      const saved = (await (await page.request.get(`${MOCK}/rest/getPlayQueue?${AUTH}`)).json())["subsonic-response"].playQueue;
      return [saved?.changedBy, saved?.entry?.[0]?.title];
    })
    .toEqual([expect.stringMatching(/^keep-player@/), titles[0]]);

  // The phone saves something newer; we keep ours and aren't asked again (a reload would save ours, which is newer).
  await saveFromArpeggi(page, ["so-40"], 0, 5_000);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.getByRole("button", { name: "keep mine" }).click({ timeout: 10_000 });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(2000);
  await expect(page.getByText(/^continue from Arpeggi/)).toHaveCount(0);
});

test("your phone playing shows in the sidebar, and starting here says it's also playing", async ({ page }) => {
  await syncOn(page);
  await page.request.get(`${MOCK}/rest/scrobble?${AUTH}&id=so-60&submission=false&c=Arpeggi`);
  const { signIn } = await import("./fixtures");
  await signIn(page);
  await expect(page.getByText("playing on Arpeggi")).toBeVisible({ timeout: 10_000 });
  await page.goto("/album/al-26");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await expect(page.getByText("Arpeggi is also playing · it can't be paused from here")).toBeVisible({ timeout: 10_000 });
});
