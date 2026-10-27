import { mkdirSync, renameSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

// Records the promo's clips into apps/video/public/clips:
// CAPTURE_URL=… CAPTURE_USER=demo CAPTURE_PASSWORD=… bun scripts/capture-video.ts [search|lyrics|radio]
const url = process.env.CAPTURE_URL ?? "http://127.0.0.1:8080";
const user = process.env.CAPTURE_USER ?? "demo";
const password = process.env.CAPTURE_PASSWORD ?? "demo";
const OUT = "apps/video/public/clips";
const SIZE = { width: 1920, height: 1080 };

async function signIn(page: Page): Promise<void> {
  await page.goto(url);
  await page.getByLabel("username").fill(user);
  await page.getByLabel("password").fill(password);
  await page.getByRole("button", { name: "sign in" }).click();
  await page.getByRole("link", { name: "albums", exact: true }).waitFor();
}

async function openFirstAlbum(page: Page): Promise<void> {
  await page.getByRole("link", { name: "albums", exact: true }).click();
  await page.locator("a[href^='/album/']").first().click();
}

const FLOWS: Record<string, (page: Page) => Promise<void>> = {
  async search(page) {
    await page.waitForTimeout(1200);
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("a", { delay: 250 });
    await page.waitForTimeout(2500);
  },
  async lyrics(page) {
    await openFirstAlbum(page);
    await page.getByRole("button", { name: "play", exact: true }).first().click();
    await page.keyboard.press("y");
    await page.waitForTimeout(7000);
  },
  async radio(page) {
    await openFirstAlbum(page);
    await page.getByRole("row").nth(1).click({ button: "right" });
    await page.getByRole("menuitem", { name: "start radio" }).click();
    await page.getByRole("button", { name: "play radio" }).waitFor();
    await page.waitForTimeout(3500);
    await page.getByRole("button", { name: "play radio" }).click();
    await page.keyboard.press("q");
    await page.waitForTimeout(4000);
  },
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
mkdirSync(OUT, { recursive: true });

for (const name of process.argv[2] ? [process.argv[2]] : Object.keys(FLOWS)) {
  const flow = FLOWS[name];
  if (!flow) throw new Error(`no clip named ${name}`);
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: `${OUT}/.raw`, size: SIZE }, colorScheme: "dark" });
  await context.addInitScript(() => {
    localStorage.setItem("keep-player:onboarded", "capture");
    localStorage.setItem("keep-player:tips", JSON.stringify({ off: true, welcomed: true }));
    localStorage.setItem("keep-player:settings", JSON.stringify({ queueSync: false }));
  });
  const page = await context.newPage();
  await signIn(page);
  await flow(page);
  const video = page.video();
  await context.close();
  renameSync((await video?.path()) as string, `${OUT}/${name}.webm`);
  console.log(`${OUT}/${name}.webm`);
}
await browser.close();
