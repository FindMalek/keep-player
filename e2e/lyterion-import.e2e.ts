import { expect, test } from "./fixtures";

test("with lyterion connected the import page shows how much of each spotify playlist is in, and what's missing", async ({
  page,
  signedIn,
}) => {
  await signedIn.goto("/import");
  const list = page.getByRole("list", { name: "spotify playlists" });
  await expect(list.getByText("2/3")).toBeVisible();
  await list.getByRole("button", { name: /Late night/ }).click();
  await expect(page.getByRole("list", { name: "missing from Late night" })).toContainText("Big Roshi – Somewhere");
});
