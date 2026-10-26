import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";

// The image installs from the workspace manifests alone (so the install layer caches): a new app or package whose
// package.json isn't copied breaks the image build with "listed in bun.lock but not on disk", and nothing else catches it.
test.each(["Dockerfile", "apps/web/Dockerfile"])("%s copies every workspace's package.json before installing", async (path) => {
  const dockerfile = await Bun.file(path).text();
  const workspaces = ["apps", "packages"].flatMap((root) =>
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && Bun.file(`${root}/${entry.name}/package.json`).size > 0)
      .map((entry) => `${root}/${entry.name}`),
  );
  const missing = workspaces.filter((workspace) => !dockerfile.includes(`COPY ${workspace}/package.json ${workspace}/`));
  expect(missing).toEqual([]);
});
