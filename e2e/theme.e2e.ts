import { expect, test } from "./fixtures";

test("a preset previews at once, saves, and survives a reload", async ({ page, signedIn }) => {
  // The fixture stubs the synced settings; this flow needs the real ones, and puts the default look back at the end.
  await page.unroute("**/api/settings");
  await page.goto("/settings/appearance");
  const radius = () => page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--look-radius"));
  const presets = page.getByRole("group", { name: "presets" });
  const putSettings = () =>
    page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PUT");

  await presets.getByRole("button", { name: "soft" }).click();
  await expect.poll(radius).toBe("8px");
  await expect(page.getByText("previewing, not saved yet")).toBeVisible();

  const saved = putSettings();
  await page.getByRole("button", { name: "save look" }).click();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect.poll(radius).toBe("8px");
  await expect(presets.getByRole("button", { name: "soft" })).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("theme code to import").fill("lode1.cool.steel.0.mono");
  await page.getByRole("button", { name: "preview" }).click();
  await expect.poll(radius).toBe("0px");
  await page.getByRole("button", { name: "revert" }).click();
  await expect.poll(radius).toBe("8px");

  await presets.getByRole("button", { name: "lodesong" }).click();
  const reset = putSettings();
  await page.getByRole("button", { name: "save look" }).click();
  await reset;
});
