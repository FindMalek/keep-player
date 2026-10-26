import { chromium, type Page } from "@playwright/test";

// Refreshes docs/*.png: SCREENSHOT_URL=… SCREENSHOT_USER=demo SCREENSHOT_PASSWORD=… bun scripts/screenshots.ts
const url = process.env.SCREENSHOT_URL ?? "http://127.0.0.1:8080";
const user = process.env.SCREENSHOT_USER ?? "demo";
const password = process.env.SCREENSHOT_PASSWORD ?? "demo";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function shoot(theme: "dark" | "light"): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
  await context.addInitScript(() => {
    localStorage.setItem("keep-player:onboarded", "screenshots");
    localStorage.setItem("keep-player:tips", JSON.stringify({ off: true, welcomed: true }));
    localStorage.setItem("keep-player:settings", JSON.stringify({ queueSync: false }));
  });
  const page = await context.newPage();
  const suffix = theme === "light" ? "-light" : "";
  const save = async (name: string) => {
    // Music keeps the network busy forever, so no "network idle": let covers decode and transitions settle.
    await page.waitForLoadState("load");
    await page.addStyleTag({ content: "[data-sonner-toaster]{display:none!important}" });
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

  await page.locator("a[href^='/album/']").first().click();
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.keyboard.press("y");
  await save("album-lyrics");

  await page.keyboard.press("y");
  await page.keyboard.press("q");
  await save("queue");
  await page.keyboard.press("q");

  await page.goto(`${url}/stats`);
  await page.getByRole("heading", { name: "stats" }).waitFor();
  await save("stats");
  await page.goto(`${url}/playlist/${await firstPlaylist(page)}`);
  await save("playlist");
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type((await firstArtist(page)) ?? "a");
  await save("search");
  await context.close();
}

async function firstPlaylist(page: Page): Promise<string> {
  const href = await page.getByRole("navigation", { name: "sidebar" }).locator("a[href^='/playlist/']").first().getAttribute("href");
  return (href ?? "").replace("/playlist/", "");
}

async function firstArtist(page: Page): Promise<string | null> {
  const artist = await page.getByRole("contentinfo").locator("a[href^='/artist/']").first().textContent();
  return artist?.split(" ")[0] ?? null;
}

async function shootPhone(): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    localStorage.setItem("keep-player:onboarded", "screenshots");
    localStorage.setItem("keep-player:tips", JSON.stringify({ off: true, welcomed: true }));
    localStorage.setItem("keep-player:settings", JSON.stringify({ queueSync: false }));
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.getByLabel("username").fill(user);
  await page.getByLabel("password").fill(password);
  await page.getByRole("button", { name: "sign in" }).click();
  await page.locator("a[href^='/album/']").first().waitFor();
  await page.locator("a[href^='/album/']").first().click();
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.waitForTimeout(2500);
  const keepMine = page.getByRole("button", { name: "keep mine" });
  if (await keepMine.isVisible()) await keepMine.click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: "docs/phone.png" });
  console.log("docs/phone.png");
  await context.close();
}

// Navidrome keeps "now playing" for a while after a shot stops; waiting it out keeps one run's playback out of the next.
const settle = () => new Promise((resolve) => setTimeout(resolve, 90_000));
await shoot("dark");
await settle();
await shoot("light");
await settle();
await shootPhone();
await browser.close();
