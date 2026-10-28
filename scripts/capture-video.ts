import { mkdirSync, writeFileSync } from "node:fs";
import { type BrowserContext, chromium, type Page } from "@playwright/test";
import { coverSvg } from "../test/mock/covers";
import { showcaseCovers } from "../test/mock/showcase";

// Records the promo's media into apps/video/public (gitignored, regenerate any time):
// CAPTURE_URL=… CAPTURE_USER=demo CAPTURE_PASSWORD=… bun scripts/capture-video.ts [session|clips|shots]
const url = process.env.CAPTURE_URL ?? "http://127.0.0.1:8080";
const user = process.env.CAPTURE_USER ?? "demo";
const password = process.env.CAPTURE_PASSWORD ?? "demo";
const CLIPS = "apps/video/public/clips";
const SHOTS = "apps/video/public/shots";
const SIZE = { width: 1920, height: 1080 };
// The record the film plays, and the song on it with synced lyrics.
const HERO = "al-0";

const covers = showcaseCovers();

/** Album art from the showcase library; anything it doesn't know (artist photos) gets a plain tile. */
function art(id: string): string {
  const spec = covers.get(id);
  return spec
    ? coverSvg(spec)
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#222"/></svg>`;
}

async function open(browser: Awaited<ReturnType<typeof chromium.launch>>, scale: number): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: scale, colorScheme: "dark" });
  await context.addInitScript(() => {
    localStorage.setItem("keep-player:onboarded", "capture");
    localStorage.setItem("keep-player:tips", JSON.stringify({ off: true, welcomed: true }));
    localStorage.setItem("keep-player:settings", JSON.stringify({ queueSync: false }));
  });
  await context.route("**/cover/**", (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/")[2] ?? "");
    return route.fulfill({ contentType: "image/svg+xml", body: art(id) });
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.getByLabel("username").fill(user);
  await page.getByLabel("password").fill(password);
  await page.getByRole("button", { name: "sign in" }).click();
  await page.getByRole("link", { name: "albums", exact: true }).waitFor();
  await page.addStyleTag({ content: "[data-sonner-toaster]{display:none!important}" });
  return { context, page };
}

async function openHero(page: Page): Promise<void> {
  await page.goto(`${url}/album/${HERO}`);
  await page.getByRole("button", { name: "play", exact: true }).first().waitFor();
}

async function playHero(page: Page): Promise<void> {
  await openHero(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
}

const CLIP_FLOWS: Record<string, (page: Page) => Promise<void>> = {
  async search(page) {
    await page.waitForTimeout(1500);
    await page.keyboard.press("ControlOrMeta+k");
    await page.waitForTimeout(600);
    await page.keyboard.type("hal", { delay: 240 });
    await page.waitForTimeout(900);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(350);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(1800);
  },
  async lyrics(page) {
    await playHero(page);
    await page.waitForTimeout(800);
    await page.keyboard.press("y");
    await page.waitForTimeout(9000);
  },
  async radio(page) {
    await openHero(page);
    await page.waitForTimeout(900);
    await page.getByRole("row").nth(1).click({ button: "right" });
    await page.waitForTimeout(700);
    await page.getByRole("menuitem", { name: "start radio" }).click();
    await page.getByRole("button", { name: "play radio" }).waitFor();
    await page.waitForTimeout(2200);
    await page
      .getByRole("button", { name: /^remove / })
      .nth(2)
      .click();
    await page.waitForTimeout(500);
    await page
      .getByRole("button", { name: /^remove / })
      .nth(4)
      .click();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "play radio" }).click();
    await page.waitForTimeout(900);
    await page.keyboard.press("q");
    await page.waitForTimeout(3500);
  },
};

async function clips(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<void> {
  mkdirSync(CLIPS, { recursive: true });
  for (const [name, flow] of Object.entries(CLIP_FLOWS)) {
    const { context, page } = await open(browser, 1);
    const path = `${CLIPS}/${name}.webm`;
    await page.screencast.start({ path, size: SIZE, quality: 100, fps: 60 });
    await flow(page);
    await page.screencast.stop();
    await context.close();
    // Remotion wants a duration in the container, which Playwright's webm lacks.
    Bun.spawnSync([
      "ffmpeg",
      "-y",
      "-loglevel",
      "error",
      "-i",
      path,
      "-c:v",
      "libx264",
      "-crf",
      "14",
      "-g",
      "10",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "60",
      path.replace(".webm", ".mp4"),
    ]);
    console.log(path.replace(".webm", ".mp4"));
  }
}

async function shots(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const { context, page } = await open(browser, 2);
  const save = async (name: string) => {
    await page.waitForLoadState("load");
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${SHOTS}/${name}.jpg`, type: "jpeg", quality: 92 });
    console.log(`${SHOTS}/${name}.jpg`);
  };
  await save("home");
  const homeTile = await page.locator(`a[href='/album/${HERO}'] img`).first().boundingBox();
  writeFileSync(`${SHOTS}/cover.svg`, art(HERO));
  await openHero(page);
  await page.waitForTimeout(500);
  const albumCover = await page.locator("img").nth(1).boundingBox();
  const play = await page.getByRole("button", { name: "play", exact: true }).first().boundingBox();
  writeFileSync("apps/video/src/rects.json", `${JSON.stringify({ homeTile, albumCover, play }, null, 2)}\n`);
  await save("album-idle");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.waitForTimeout(600);
  await save("album");
  for (const link of ["artists", "songs", "genres", "history", "moments"]) {
    await page.getByRole("link", { name: link, exact: true }).click();
    await save(link);
  }
  await page.goto(`${url}/stats`);
  await page.getByRole("heading", { name: "stats" }).waitFor();
  await save("stats");
  await page.keyboard.press("q");
  await save("queue");
  await page.keyboard.press("q");
  await page.keyboard.press("y");
  await save("lyrics");
  await context.close();
}

interface Point {
  x: number;
  y: number;
}

type SessionEvent =
  | { kind: "move"; t0: number; t1: number; from: Point; to: Point }
  | { kind: "click"; t: number; at: Point; button: "left" | "right" }
  | { kind: "key"; t: number; label: string };

/**
 * One real listening session, recorded as a single screencast while every cursor move, click and keystroke is logged
 * with its time. The film is post-produced from that log (camera, cursor, sounds), like Screen Studio does.
 */
async function session(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<void> {
  mkdirSync(CLIPS, { recursive: true });
  const { context, page } = await open(browser, 1);
  const events: SessionEvent[] = [];
  let origin = 0;
  let at: Point = { x: 1500, y: 760 };
  const now = () => (Date.now() - origin) / 1000;
  const center = async (target: ReturnType<Page["locator"]>): Promise<Point> => {
    const box = await target.first().boundingBox();
    if (!box) throw new Error("target not on screen");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const glide = async (to: Point, ms = 700) => {
    const from = at;
    const t0 = now();
    const steps = Math.max(10, Math.round(ms / 16));
    for (let i = 1; i <= steps; i += 1) {
      const p = i / steps;
      const e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
      await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      await page.waitForTimeout(ms / steps);
    }
    events.push({ kind: "move", t0, t1: now(), from, to });
    at = to;
  };
  const click = async (button: "left" | "right" = "left") => {
    events.push({ kind: "click", t: now(), at, button });
    await page.mouse.click(at.x, at.y, { button });
  };
  const press = async (key: string, label: string) => {
    events.push({ kind: "key", t: now(), label });
    await page.keyboard.press(key);
  };

  await page.goto(url);
  await page.getByRole("link", { name: "albums", exact: true }).waitFor();
  await page.waitForTimeout(2500);
  const path = `${CLIPS}/session.webm`;
  await page.screencast.start({ path, size: SIZE, quality: 100, fps: 60 });
  origin = Date.now();
  await page.waitForTimeout(1800);

  // 1. search: click the bar, type, pick the song.
  await glide({ x: 1050, y: 22 }, 900);
  await click();
  await page.waitForTimeout(700);
  for (const letter of "hal") {
    await press(letter, letter);
    await page.waitForTimeout(210);
  }
  await page.waitForTimeout(1100);
  await glide(await center(page.getByText("Afterglow", { exact: true })), 800);
  await page.waitForTimeout(250);
  await click();
  await page.waitForTimeout(2200);

  // 2. lyrics.
  await press("y", "y");
  await page.waitForTimeout(8500);
  await press("y", "y");
  await page.waitForTimeout(900);

  // 3. radio: the hero album, a track's menu, start radio, preview, play.
  await glide(await center(page.locator("a[href='/album/al-0'] img")), 900);
  await click();
  await page.getByRole("button", { name: "play", exact: true }).first().waitFor();
  await page.waitForTimeout(1200);
  await glide(await center(page.getByRole("row").nth(2)), 800);
  await click("right");
  await page.waitForTimeout(700);
  await glide(await center(page.getByRole("menuitem", { name: "start radio" })), 600);
  await click();
  await page.getByRole("button", { name: "play radio" }).waitFor();
  await page.waitForTimeout(2200);
  for (const index of [3, 5]) {
    await glide(await center(page.getByRole("button", { name: /^remove / }).nth(index)), 650);
    await click();
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(700);
  await glide(await center(page.getByRole("button", { name: "play radio" })), 800);
  await click();
  await page.waitForTimeout(900);
  await press("q", "q");
  await page.waitForTimeout(3200);

  await page.screencast.stop();
  await context.close();
  writeFileSync("apps/video/src/session.json", `${JSON.stringify(events, null, 2)}\n`);
  Bun.spawnSync([
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    "-i",
    path,
    "-c:v",
    "libx264",
    "-crf",
    "14",
    "-g",
    "10",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "60",
    path.replace(".webm", ".mp4"),
  ]);
  console.log(`${path.replace(".webm", ".mp4")} (${events.length} events)`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const only = process.argv[2];
if (only === "session") await session(browser);
if (!only || only === "shots") await shots(browser);
if (only === "clips") await clips(browser);
await browser.close();
