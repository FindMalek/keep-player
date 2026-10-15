import { expect, test } from "./fixtures";

const stored = (page: import("@playwright/test").Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("keep-player:settings") ?? "{}") as Record<string, unknown>);

test("normalization and pre-amp are settings", async ({ page, signedIn }) => {
  await signedIn.goto("/settings/playback");
  const group = page.getByRole("group", { name: "normalization" });
  await expect(group.getByRole("button", { name: "auto" })).toHaveAttribute("aria-pressed", "true");
  await group.getByRole("button", { name: "track" }).click();
  await expect.poll(async () => (await stored(page)).normalization).toBe("track");

  const preamp = page.getByRole("slider", { name: "pre-amp decibels" });
  await preamp.focus();
  await page.keyboard.press("End");
  await expect(page.getByText("+12 dB")).toBeVisible();
  await expect.poll(async () => (await stored(page)).preamp).toBe(12);
});

test("the equalizer opens, presets set the bands and turn it on, reset flattens it", async ({ page, signedIn }) => {
  await signedIn.goto("/settings/playback");
  await page.getByRole("button", { name: "adjust" }).click();
  const sheet = page.getByRole("dialog", { name: "equalizer" });
  await expect(sheet).toBeVisible();
  await expect(page.getByRole("switch", { name: "equalizer" })).not.toBeChecked();

  await sheet.getByRole("button", { name: "bass boost" }).click();
  await expect(sheet.getByRole("button", { name: "bass boost" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await stored(page)).eqOn).toBe(true);
  await expect.poll(async () => ((await stored(page)).eqGains as number[])[0]).toBe(6);

  await sheet.getByRole("slider", { name: "16k Hz" }).focus();
  await page.keyboard.press("End");
  await expect.poll(async () => ((await stored(page)).eqGains as number[])[9]).toBe(12);

  await sheet.getByRole("button", { name: "reset" }).click();
  await expect.poll(async () => ((await stored(page)).eqGains as number[]).every((gain) => gain === 0)).toBe(true);
});
