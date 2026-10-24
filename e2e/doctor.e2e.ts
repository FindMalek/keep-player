import { expect, test } from "./fixtures";

test("the library doctor lists each check with a count and a fix hint", async ({ page, signedIn }) => {
  const call = (path: string, method = "GET") =>
    signedIn.evaluate(async ([url, verb]) => (await fetch(url, { method: verb, headers: { "x-keep-player": "1" } })).json(), [
      path,
      method,
    ] as const);
  await call("/api/index", "POST");
  await expect.poll(async () => (await call("/api/index")).building, { timeout: 20_000 }).toBe(false);

  const report = await call("/api/doctor");
  expect(report.checks.map((check: { id: string }) => check.id)).toContain("duplicates");
  expect(report.health).toBeGreaterThanOrEqual(0);

  await page.goto("/doctor");
  await expect(page.getByRole("heading", { name: "library doctor" })).toBeVisible();
  await expect(page.getByText("library health")).toBeVisible();
  await expect(page.getByText(/songs without replaygain · /)).toBeVisible();
  await expect(page.getByText(/albums without a cover · /)).toBeVisible();
});

test("with lyterion's ⇪ Upgrade playlist around, a finding's fix button hands that song to it", async ({ page, signedIn }) => {
  const call = (path: string, method = "GET") =>
    signedIn.evaluate(async ([url, verb]) => (await fetch(url, { method: verb, headers: { "x-keep-player": "1" } })).json(), [
      path,
      method,
    ] as const);
  await call("/api/index", "POST");
  await expect.poll(async () => (await call("/api/index")).building, { timeout: 20_000 }).toBe(false);
  const created = await call(`/rest/createPlaylist?name=${encodeURIComponent("⇪ Upgrade")}&f=json`);
  const id = created["subsonic-response"].playlist.id as string;

  await page.goto("/doctor");
  await page
    .getByRole("button", { name: /^fix .* with lyterion$/ })
    .first()
    .click();
  await expect(page.getByText(/sent to lyterion to fix/)).toBeVisible();
  const playlist = await call(`/rest/getPlaylist?id=${id}&f=json`);
  expect(playlist["subsonic-response"].playlist.entry?.length ?? 0).toBeGreaterThan(0);
});
