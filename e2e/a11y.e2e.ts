import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const PAGES = [
  "/",
  "/albums",
  "/album/al-3",
  "/artists",
  "/artist/ar-2",
  "/songs",
  "/genres",
  "/import",
  "/doctor",
  "/listen",
  "/genre/Rock",
  "/folders",
  "/folders/ar-2",
  "/playlist/pl-1",
];

async function violations(page: Page, options: { popupOpen?: boolean } = {}): Promise<string[]> {
  // Let open/close animations finish: half-faded text would be judged on its in-between contrast.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      // The playing equalizer loops forever; only wait for animations that end.
      .filter((animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
      .every((animation) => animation.playState !== "running"),
  );
  const builder = new AxeBuilder({ page });
  // An open menu is portaled to <body>, outside every landmark; `region` (a best-practice rule, not WCAG) flags it.
  if (options.popupOpen) builder.disableRules(["region"]);
  const result = await builder.analyze();
  return result.violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes
        .map((node) => node.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );
}

for (const scheme of ["light", "dark"] as const)
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    for (const path of PAGES)
      test(`no accessibility violations on ${path}`, async ({ page, signedIn }) => {
        // The pointer rests where sign-in left it; a link that ends up under it would open its hover card.
        await page.mouse.move(0, 0);
        await signedIn.goto(path);
        await page.locator("main h1, main [aria-label=tracks], main a").first().waitFor();
        await page.waitForTimeout(300);
        expect(await violations(page)).toEqual([]);
      });

    test("no accessibility violations with the player, panels, palette, cheat sheet and menus open", async ({ page, signedIn }) => {
      await signedIn.goto("/album/al-3");
      await page.getByRole("button", { name: "play", exact: true }).first().click();
      await page.keyboard.press("q");
      await expect(page.getByRole("complementary", { name: "queue" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.keyboard.press("y");
      await expect(page.getByRole("complementary", { name: "lyrics" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.keyboard.press("ControlOrMeta+k");
      await page.getByRole("dialog", { name: "search" }).getByRole("combobox").fill("night");
      await page.waitForTimeout(500);
      expect(await violations(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "search" })).toBeHidden();
      await page.locator("body").press("?");
      await expect(page.getByRole("dialog", { name: "keyboard shortcuts" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "keyboard shortcuts" })).toBeHidden();
      await page.getByRole("button", { name: /demo$/ }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      expect(await violations(page, { popupOpen: true })).toEqual([]);
    });

    test("no accessibility violations on the login page", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "sign in" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
