import { expect, test } from "./fixtures";

test("the first panel of a session opens at once, not after a suspense pause", async ({ page, signedIn }) => {
  await expect(signedIn.locator('a[href^="/album/"]').first()).toBeVisible();
  await page.goto((await page.locator('a[href^="/album/"]').first().getAttribute("href")) ?? "/");
  await page
    .getByRole("button", { name: /^play$/ })
    .first()
    .click();
  await page.waitForTimeout(1000);
  // From the click to the lyrics on screen, timed in the page. A suspending panel held everything back for React's
  // 300 ms suspense throttle on the first open of a session, whatever the machine.
  const ms = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const start = performance.now();
        const shown = () => [...document.querySelectorAll("span, div")].some((el) => /^(plain|synced)$/.test(el.textContent ?? ""));
        const observer = new MutationObserver(() => {
          if (!shown()) return;
          observer.disconnect();
          resolve(performance.now() - start);
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        document
          .querySelector<HTMLButtonElement>('[role=contentinfo] button[aria-label="lyrics"], footer button[aria-label="lyrics"]')
          ?.click();
      }),
  );
  expect(ms).toBeLessThan(200);
});
