import { expect, test } from "./fixtures";

test("the lyrics page shows coverage and the songs without lyrics, and an admin can ask again", async ({ page, signedIn }) => {
  const call = (path: string, method = "GET") =>
    signedIn.evaluate(async ([url, verb]) => (await fetch(url, { method: verb, headers: { "x-lodesong": "1" } })).json(), [
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

  // Other tests share the server and look lyrics up too: check this test's songs, not exact totals.
  const missingIds = async () => new Set(((await call("/api/lyrics/missing?limit=500")).songs as { id: string }[]).map((song) => song.id));
  const coverage = await call("/api/lyrics/coverage");
  expect(coverage.total).toBe(10_000);
  expect(coverage.missing).toBeGreaterThanOrEqual(missing.length);
  const listed = await missingIds();
  for (const [id] of missing) expect(listed.has(id as string)).toBe(true);

  await signedIn.goto("/settings/lyrics");
  await page.getByRole("link", { name: "open" }).click();
  await expect(page).toHaveURL(/\/lyrics$/);
  await expect(page.getByRole("img", { name: "lyrics coverage" })).toBeVisible();
  await expect(page.getByText(/^no lyrics found · \d+ songs?$/)).toBeVisible();
  await expect(page.locator("[data-slot=table-row]").filter({ hasText: /\S/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "fetch missing now" }).click();
  await expect(page.getByText(/will be asked again|asking lrclib again/)).toBeVisible();
  // Forgotten, so asked again (on next play, the backfill is off here) rather than listed as missing.
  const after = await missingIds();
  for (const [id] of missing) expect(after.has(id as string)).toBe(false);
});
