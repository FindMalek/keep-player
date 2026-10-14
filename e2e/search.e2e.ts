import { expect, fakeMediaClock, test } from "./fixtures";

test("⌘K finds a song and picking it plays it", async ({ signedIn: page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill("ember");
  await expect(dialog.getByRole("group", { name: "songs" })).toBeVisible();
  await dialog.getByRole("group", { name: "songs" }).getByRole("option").first().click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
});

test("a few words of a lyric find the song, and picking it plays from that line", async ({ page, signedIn }) => {
  await page.addInitScript(fakeMediaClock);
  await signedIn.goto("/");
  const call = (path: string, method = "GET") =>
    page.evaluate(async ([url, verb]) => (await fetch(url, { method: verb, headers: { "x-keep-player": "1" } })).json(), [
      path,
      method,
    ] as const);
  // Hits come from the search index, and lyrics enter it once looked up (the backfill is off here).
  await call("/api/index", "POST");
  await expect.poll(async () => (await call("/api/index")).building, { timeout: 20_000 }).toBe(false);
  const lyrics = await call("/api/lyrics/so-2");
  const line = lyrics.lines[5].text as string;

  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  // Lower case, a typo in the first word, and the lyrics-only filter.
  const typo = line.toLowerCase().replace(/^(\w)(\w)/, "$2$1");
  await dialog.getByRole("combobox").fill(`lyrics: ${typo}`);
  const group = dialog.getByRole("group", { name: "lyrics" });
  await expect(group.getByRole("option").first()).toContainText(line);
  await expect(dialog.getByRole("group", { name: "songs" })).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => seconds(await page.locator("[data-slot=audio-player-time][data-type=current]").textContent()))
    .toBeGreaterThanOrEqual(25);
});

const seconds = (text: string | null) => (text ?? "0:00").split(":").reduce((total, part) => total * 60 + Number(part), 0);
