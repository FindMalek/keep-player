import { expect, test } from "./fixtures";

test("the lyrics page shows coverage and the songs without lyrics, and an admin can ask again", async ({ page, signedIn }) => {
  const call = (path: string, method = "GET") =>
    signedIn.evaluate(async ([url, verb]) => (await fetch(url, { method: verb, headers: { "x-keep-player": "1" } })).json(), [
      path,
      method,
    ] as const);
  await call("/api/index", "POST");
  await expect.poll(async () => (await call("/api/index")).building, { timeout: 20_000 }).toBe(false);
  // The backfill is off here: look a few songs up so some are found and some aren't.
  const looked = await Promise.all(
    ["so-1", "so-2", "so-3", "so-5", "so-7"].map(async (id) => [id, (await call(`/api/lyrics/${id}`)).status]),
  );
  const missing = looked.filter(([, status]) => status === "missing");
  expect(missing.length).toBeGreaterThan(0);

  const coverage = await call("/api/lyrics/coverage");
  expect(coverage.total).toBe(10_000);
  expect(coverage.missing).toBe(missing.length);

  await signedIn.getByRole("button", { name: /demo$/ }).click();
  await page.getByRole("menuitem", { name: "lyrics coverage" }).click();
  await expect(page).toHaveURL(/\/lyrics$/);
  await expect(page.getByRole("img", { name: "lyrics coverage" })).toBeVisible();
  await expect(page.getByText(`no lyrics found · ${missing.length} song`)).toBeVisible();
  await expect(page.locator("[data-slot=table-row]").filter({ hasText: /\S/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "fetch missing now" }).click();
  await expect(page.getByText(/will be asked again|asking lrclib again/)).toBeVisible();
  await expect.poll(async () => (await call("/api/lyrics/coverage")).missing).toBe(0);
});
