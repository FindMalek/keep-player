import { expect, test } from "./fixtures";

test("a pasted link is previewed, added, followed step by step and lands in the library", async ({ signedIn: page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill("https://www.youtube.com/watch?v=YmBN_ZzSD_8");
  await dialog.getByRole("option", { name: /add “https:/ }).click();

  await expect(dialog.getByText("Widows Weep")).toBeVisible();
  await expect(dialog.getByText("SHYLER · 2:12")).toBeVisible();
  await expect(dialog.getByText("youtube link")).toBeVisible();

  await dialog.getByRole("button", { name: /add to library/ }).click();
  const steps = dialog.getByRole("list", { name: "progress" });
  await expect(steps).toBeVisible();
  // The step list gives way to the placed block (the song itself isn't in the mock library, so no play yet).
  await expect(steps).toBeHidden({ timeout: 15_000 });
  await expect(dialog.getByRole("button", { name: /scanning|not found yet|play now/ })).toBeVisible();
});

test("a typed name goes the same way, and a refusal from lyterion is shown", async ({ signedIn: page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill("shyler widows weep");
  await dialog.getByRole("option", { name: /add “shyler widows weep”/ }).click();
  await expect(dialog.getByText("best match on youtube")).toBeVisible();

  await dialog.getByRole("textbox", { name: "song to add" }).fill("some album link");
  await dialog.getByRole("textbox", { name: "song to add" }).press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("deezer track link");
});

test("escape goes back to the search with the box intact", async ({ signedIn: page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("option", { name: "add a song from a link or a name" }).click();
  await expect(dialog.getByRole("textbox", { name: "song to add" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("combobox")).toBeVisible();
});

test("a name lyterion can't place yet is previewed without an artist or length", async ({ signedIn: page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill("some unreleased demo");
  await dialog.getByRole("option", { name: /add “some unreleased demo”/ }).click();
  await expect(dialog.getByText("artist found when it starts")).toBeVisible();
  await expect(dialog.getByText("best match on youtube, picked when it starts")).toBeVisible();
});
