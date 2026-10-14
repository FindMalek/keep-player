import { expect, fakeMediaClock, test } from "./fixtures";

/**
 * Counts TrackRow re-renders through React's devtools hook (production React still reports commits to it). A memo row
 * re-rendered when its committed props object changed since the last commit we saw.
 */
function countRowRenders(): void {
  const seen = new WeakMap<object, unknown>();
  const win = window as unknown as { __rowRenders: number; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown };
  win.__rowRenders = 0;
  type Fiber = {
    child: Fiber | null;
    sibling: Fiber | null;
    alternate: Fiber | null;
    memoizedProps: unknown;
    elementType?: { displayName?: string };
  };
  win.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject() {
      return 1;
    },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id: number, root: { current: Fiber }) {
      const stack: Fiber[] = [root.current];
      while (stack.length) {
        const fiber = stack.pop() as Fiber;
        if (fiber.elementType?.displayName === "TrackRow") {
          const previous = seen.has(fiber) ? seen.get(fiber) : fiber.alternate ? seen.get(fiber.alternate) : undefined;
          if (previous !== undefined && previous !== fiber.memoizedProps) win.__rowRenders += 1;
          seen.set(fiber, fiber.memoizedProps);
          if (fiber.alternate) seen.set(fiber.alternate, fiber.memoizedProps);
        }
        if (fiber.child) stack.push(fiber.child);
        if (fiber.sibling) stack.push(fiber.sibling);
      }
    },
  };
}

test("track rows don't re-render while a song plays", async ({ page, signedIn }) => {
  test.setTimeout(60_000);
  await page.addInitScript(countRowRenders);
  await page.addInitScript(fakeMediaClock);
  await signedIn.goto("/songs");
  // Like a person would: double-click the first song (its play button only shows on hover).
  await page.locator("[aria-label=tracks] tbody tr").first().dblclick();
  const elapsed = page.locator("[data-slot=audio-player-time][data-type=current]");
  await expect(elapsed).toHaveText("0:01", { timeout: 10_000 });
  // Precache downloads mark rows as saved for offline; let that settle, it isn't playback.
  await expect(page.locator("[aria-label=tracks]").getByLabel("saved for offline")).toHaveCount(3, { timeout: 15_000 });
  await page.evaluate(() => {
    (window as unknown as { __rowRenders: number }).__rowRenders = 0;
  });
  await page.waitForTimeout(10_000);
  await expect(elapsed).not.toHaveText(/^0:0[0-8]$/);
  expect(await page.evaluate(() => (window as unknown as { __rowRenders: number }).__rowRenders)).toBe(0);
});
