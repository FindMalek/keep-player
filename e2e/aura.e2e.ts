import { expect, test } from "./fixtures";

test("a playlist has an aura behind its header, three vibe words, and exports as a PNG", async ({ page, signedIn }) => {
  await signedIn.goto("/playlist/pl-1");
  const header = page.locator("main header").first();
  await expect(header.locator("canvas")).toBeAttached();
  await expect(page.getByRole("list", { name: "vibe" }).getByRole("listitem")).toHaveCount(3);

  // The picture is not blank: some pixel differs from the corner (ink on paper).
  const varied = await header.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data ?? new Uint8ClampedArray();
    return data.some((value, index) => index > 3 && value !== data[index % 4]);
  });
  expect(varied).toBe(true);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "aura png" }).click();
  expect((await download).suggestedFilename()).toMatch(/-aura\.png$/);
});

test("the aura holds still under reduced motion", async ({ page, signedIn }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signedIn.goto("/playlist/pl-1");
  const canvas = page.locator("main header canvas").first();
  await expect(canvas).toBeAttached();
  const snapshot = () => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  const first = await snapshot();
  await page.waitForTimeout(700);
  expect(await snapshot()).toBe(first);
});
