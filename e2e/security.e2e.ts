import { expect, test } from "./fixtures";

test("credentials never reach the browser: no token in storage, cookies or media URLs", async ({ page, signedIn }) => {
  const mediaUrls: string[] = [];
  page.on("request", (request) => {
    if (/\/rest\/(stream|getCoverArt)/.test(request.url())) mediaUrls.push(request.url());
  });
  await signedIn.goto("/album/al-3");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();

  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }) + document.cookie);
  expect(storage).not.toMatch(/"(token|salt)"|kp_session/);
  expect(mediaUrls.length).toBeGreaterThan(0);
  for (const url of mediaUrls) expect(new URL(url).searchParams.has("t") || new URL(url).searchParams.has("u")).toBe(false);
});

test("logging out ends the server session", async ({ page, signedIn }) => {
  await signedIn.getByRole("button", { name: /demo$/ }).click();
  await page.getByRole("menuitem", { name: "log out" }).click();
  await expect(page.getByRole("button", { name: "sign in" })).toBeVisible();
  const status = await page.evaluate(() =>
    fetch("/rest/ping?f=json", { headers: { "x-keep-player": "1" } }).then((response) => response.status),
  );
  expect(status).toBe(401);
});
