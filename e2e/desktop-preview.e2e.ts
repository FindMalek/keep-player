import { expect, test } from "./fixtures";

test("in the desktop app, four taps on the sign-in background ask it for the preview menu", async ({ page }) => {
  await page.addInitScript(() => {
    const sent: unknown[] = [];
    Object.assign(window, { sent, webkit: { messageHandlers: { keep: { postMessage: (message: unknown) => sent.push(message) } } } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "sign in" })).toBeVisible();
  const sent = () => page.evaluate(() => (window as unknown as { sent: unknown[] }).sent);

  // Taps on the form are typing, not the gesture.
  for (let i = 0; i < 4; i++) await page.getByText("sign in with your navidrome account").click();
  for (let i = 0; i < 3; i++) await page.mouse.click(10, 10);
  expect(await sent()).toEqual([]);
  await page.mouse.click(10, 10);
  expect(await sent()).toEqual([{ preview: true }]);
});
