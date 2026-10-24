import { expect, test } from "./fixtures";

test("jump back in lists the album you just played from, newest first", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const name = (await page.getByRole("heading", { level: 1 }).textContent())?.trim() ?? "";
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.goto("/");
  await expect(page.getByRole("list", { name: "jump back in" }).getByRole("link").first()).toContainText(name);
});
