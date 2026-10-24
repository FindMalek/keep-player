import { expect, test } from "./fixtures";

test("a playlist from a description is filled with your own songs and saved", async ({ page, signedIn }) => {
  const call = (path: string, method = "GET") =>
    signedIn.evaluate(async ([url, verb]) => (await fetch(url, { method: verb, headers: { "x-keep-player": "1" } })).json(), [
      path,
      method,
    ] as const);
  // The prompt picks from the library index; a fresh server builds it after the first sign-in.
  await call("/api/index", "POST");
  await expect.poll(async () => (await call("/api/index")).building, { timeout: 20_000 }).toBe(false);
  await signedIn.goto("/");
  await page.getByRole("button", { name: "new playlist" }).click();
  const dialog = page.getByRole("dialog", { name: "new playlist" });
  await dialog.getByLabel("describe it").fill("rainy sunday, slow, warm");
  const made = page.waitForResponse("**/api/ai/playlist");
  await dialog.getByRole("button", { name: "make it" }).click();
  expect((await made).ok()).toBe(true);
  await expect(dialog.getByLabel("name")).toHaveValue("rainy sunday");
  await expect(dialog.getByText(/\d+ of your songs/)).toBeVisible();
  await dialog.getByRole("button", { name: "create" }).click();
  await expect(page).toHaveURL(/\/playlist\//);
  await expect(page.getByRole("heading", { name: "rainy sunday" })).toBeVisible();
});
