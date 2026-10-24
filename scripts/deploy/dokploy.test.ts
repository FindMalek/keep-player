import { afterAll, beforeAll, expect, test } from "bun:test";

/** A tiny stand-in for Dokploy and the GitHub API, so the preview script runs end to end without either. */
const calls: { method: string; path: string; body: unknown }[] = [];
const comments: { id: number; body: string }[] = [];
const applications: { name: string; applicationId: string; appName: string }[] = [
  { name: "keep-player-demo", applicationId: "demo-id", appName: "keep-player-demo-abc" },
];
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const body = req.method === "POST" || req.method === "PATCH" ? await req.json().catch(() => null) : null;
      calls.push({ method: req.method, path: url.pathname, body });
      const json = (value: unknown) => Response.json(value);
      if (url.pathname === "/api/project.all")
        return json([{ name: "keep-player-previews", environments: [{ environmentId: "env", projectId: "proj", applications }] }]);
      if (url.pathname === "/api/application.create") {
        const { name } = body as { name: string };
        applications.push({ name, applicationId: `${name}-id`, appName: `${name}-x` });
        return json({});
      }
      if (url.pathname === "/api/application.one") {
        const id = url.searchParams.get("applicationId");
        return json({ ...applications.find((a) => a.applicationId === id), applicationStatus: "done" });
      }
      if (url.pathname === "/api/domain.byApplicationId") return json([]);
      if (url.pathname === "/api/application.delete") {
        const { applicationId } = body as { applicationId: string };
        applications.splice(
          applications.findIndex((a) => a.applicationId === applicationId),
          1,
        );
        return json({});
      }
      if (url.pathname.endsWith("/comments") && req.method === "GET") return json(comments);
      if (url.pathname.endsWith("/comments") && req.method === "POST") {
        comments.push({ id: comments.length + 1, body: (body as { body: string }).body });
        return json({});
      }
      if (url.pathname.includes("/comments/")) {
        const comment = comments.find((c) => url.pathname.endsWith(`/${c.id}`));
        if (comment) comment.body = (body as { body: string }).body;
        return json({});
      }
      return json({});
    },
  });
});

afterAll(() => server.stop(true));

async function run(mode: string): Promise<number> {
  const proc = Bun.spawn(["node", "scripts/deploy/dokploy.mjs", mode], {
    env: {
      PATH: process.env.PATH ?? "",
      DOKPLOY_URL: `http://localhost:${server.port}`,
      DOKPLOY_API_KEY: "k",
      GITHUB_API_URL: `http://localhost:${server.port}`,
      GITHUB_TOKEN: "t",
      GITHUB_REPOSITORY: "FindMalek/keep-player",
      PR_NUMBER: "7",
      PREVIEW_DOMAIN: "preview.example.test",
      POLL_INTERVAL_MS: "10",
      GHCR_USERNAME: "u",
      GHCR_READ_TOKEN: "p",
    },
    stdout: "ignore",
    stderr: "inherit",
  });
  return proc.exited;
}

test("a preview is deployed, tied to the demo navidrome, and one sticky comment tracks it", async () => {
  expect(await run("preview-up")).toBe(0);
  const save = calls.find((c) => c.path === "/api/application.saveEnvironment");
  const env = (save?.body as { env: string } | undefined)?.env;
  expect(env).toContain("NAVIDROME_URL=http://keep-player-demo-abc:4533");
  expect(env).toContain("LRCLIB_URL=");
  expect(env).toContain("DEMO_SEED=on");
  expect(env).toContain("INDEX_USER=demo");
  const provider = calls.find((c) => c.path === "/api/application.saveDockerProvider");
  expect((provider?.body as { dockerImage: string } | undefined)?.dockerImage).toBe("ghcr.io/findmalek/keep-player:pr-7");
  const domain = calls.find((c) => c.path === "/api/domain.create");
  expect((domain?.body as { host: string } | undefined)?.host).toBe("player-pr-7.preview.example.test");
  expect(comments).toHaveLength(1);
  expect(comments[0]?.body).toContain("<!-- keep-player-preview -->");
  expect(comments[0]?.body).toContain("✅ Ready");
  expect(comments[0]?.body).toContain("[Visit Preview](https://player-pr-7.preview.example.test)");
});

test("a second push edits the same comment instead of adding one", async () => {
  expect(await run("preview-up")).toBe(0);
  expect(comments).toHaveLength(1);
});

test("closing the PR deletes the app and marks the comment deleted", async () => {
  expect(await run("preview-down")).toBe(0);
  expect(applications.some((a) => a.name === "keep-player-pr-7")).toBe(false);
  expect(comments[0]?.body).toContain("🗑 Deleted");
});
