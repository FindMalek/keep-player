import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "./fixtures";

test("an admin uploads a song and it lands in the upload folder; anything that isn't music is refused", async ({ page, signedIn }) => {
  await signedIn.goto("/upload");
  const stamp = Date.now();
  await page.getByLabel("pick files").setInputFiles([
    { name: `song-${stamp}.mp3`, mimeType: "audio/mpeg", buffer: Buffer.from("ID3 not really a song") },
    { name: `run-${stamp}.sh`, mimeType: "text/plain", buffer: Buffer.from("echo hi") },
  ]);
  const uploads = page.getByRole("list", { name: "uploads" });
  await expect(uploads.getByText("done")).toBeVisible();
  await expect(uploads.getByText("not a music file")).toBeVisible();
  const saved = `test-results/uploads/song-${stamp}.mp3`;
  expect(existsSync(saved)).toBe(true);
  expect(readFileSync(saved, "utf8")).toBe("ID3 not really a song");
});
