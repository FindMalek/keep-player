import { chromium, type Page } from "@playwright/test";

/*
 * Refreshes the README screenshots (docs/*.png, and *-light.png) from a running keep music. Point it at an instance
 * with a library worth showing (the current ones use Creative Commons albums, see the README credits):
 *
 *   SCREENSHOT_URL=https://music.example.com SCREENSHOT_USER=demo SCREENSHOT_PASSWORD=… bun scripts/screenshots.ts
 *
 * CHROMIUM_PATH picks a browser binary when Playwright's own isn't installed.
 */
const url = process.env.SCREENSHOT_URL ?? "http://127.0.0.1:8080";
const user = process.env.SCREENSHOT_USER ?? "demo";
const password = process.env.SCREENSHOT_PASSWORD ?? "demo";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function shoot(theme: "dark" | "light"): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
  // Skip the first-run setup and the tips: screenshots show the app, not its onboarding.
  await context.addInitScript(() => {
    localStorage.setItem("keep-player:onboarded", "screenshots");
    localStorage.setItem("keep-player:tips", JSON.stringify({ off: true, welcomed: true }));
  });
  const page = await context.newPage();
  const suffix = theme === "light" ? "-light" : "";
  const save = async (name: string) => {
    // Music keeps the network busy forever, so no "network idle": let covers decode and transitions settle.
    await page.waitForLoadState("load");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `docs/${name}${suffix}.png` });
    console.log(`docs/${name}${suffix}.png`);
  };

  await page.goto(url);
  await save("login");
  await page.getByLabel("username").fill(user);
  await page.getByLabel("password").fill(password);
  await page.getByRole("button", { name: "sign in" }).click();
  await page.getByRole("link", { name: "albums", exact: true }).waitFor();
  await save("home");

  await page.getByRole("link", { name: "albums", exact: true }).click();
  await save("albums");

  // The first album, playing, with its lyrics open.
  await page.locator("a[href^='/album/']").first().click();
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.keyboard.press("y");
  await save("album-lyrics");

  await page.keyboard.press("y");
  await page.keyboard.press("q");
  await save("queue");
  await page.keyboard.press("q");

  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type((await firstArtist(page)) ?? "a");
  await save("search");
  await context.close();
}

async function firstArtist(page: Page): Promise<string | null> {
  const artist = await page.getByRole("contentinfo").locator("a[href^='/artist/']").first().textContent();
  return artist?.split(" ")[0] ?? null;
}

await shoot("dark");
await shoot("light");
await browser.close();
