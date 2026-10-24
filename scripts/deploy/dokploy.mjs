#!/usr/bin/env node
// PR previews on Dokploy through its API, see docs/previews.md. One app per PR plus one shared demo Navidrome.
import { createHash, randomBytes } from "node:crypto";

const MODE = process.argv[2];
const COMMENT_MARKER = "<!-- keep-player-preview -->";
const PROJECT = "keep-player-previews";
const DEMO_APP = "keep-player-demo";
const DEMO_USER = "demo";
const DEMO_PASSWORD = "demo";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 5_000;
const POLL_TIMEOUT_MS = 15 * 60_000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const DOKPLOY_URL = requireEnv("DOKPLOY_URL").replace(/\/$/, "");
const DOKPLOY_PUBLIC_URL = (process.env.DOKPLOY_PUBLIC_URL || DOKPLOY_URL).replace(/\/$/, "");
const DOKPLOY_API_KEY = requireEnv("DOKPLOY_API_KEY");

async function dokploy(path, body) {
  const isQuery = body === undefined || path.endsWith("?");
  const url = `${DOKPLOY_URL}/api/${isQuery ? path.replace(/\?$/, "") : path}`;
  const res = await fetch(url, {
    method: isQuery ? "GET" : "POST",
    headers: { "x-api-key": DOKPLOY_API_KEY, "content-type": "application/json" },
    body: isQuery ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`dokploy ${path} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const query = (path, params) => dokploy(`${path}?${new URLSearchParams(params)}`);

async function findProject() {
  const projects = await dokploy("project.all");
  return projects.find((p) => p.name === PROJECT) ?? null;
}

async function ensureEnvironment() {
  let project = await findProject();
  if (!project) {
    await dokploy("project.create", { name: PROJECT, description: "managed by scripts/deploy/dokploy.mjs" });
    project = await findProject();
  }
  const environment = project?.environments?.[0];
  if (!environment) throw new Error(`no environment in project ${PROJECT}`);
  // project.all leaves projectId off its environments; the Inspect links need it.
  return { ...environment, projectId: project.projectId };
}

async function ensureApplication(environment, name) {
  const existing = environment.applications?.find((a) => a.name === name);
  if (existing) return existing;
  await dokploy("application.create", { name, appName: name, environmentId: environment.environmentId });
  const fresh = await ensureEnvironment();
  const app = fresh.applications.find((a) => a.name === name);
  if (!app) throw new Error(`application ${name} was not created`);
  return app;
}

async function ensureDomain(applicationId, host, port) {
  const domains = await query("domain.byApplicationId", { applicationId });
  if (domains.some((d) => d.host === host)) return;
  await dokploy("domain.create", {
    host,
    port,
    https: true,
    certificateType: "custom",
    customCertResolver: "vercel",
    middlewares: ["tailnet-only@file"],
    applicationId,
    domainType: "application",
  });
}

const envText = (vars) =>
  Object.entries(vars)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

async function deployApp(environment, app) {
  const application = await ensureApplication(environment, app.name);
  const { applicationId } = application;
  // The images are public: no login. A workflow's own token expires with the run, and Dokploy would keep sending it on
  // every later pull (production too) and get "denied". A long-lived read token is used only when one is set on purpose.
  const token = process.env.GHCR_READ_TOKEN;
  await dokploy("application.saveDockerProvider", {
    applicationId,
    dockerImage: app.image,
    registryUrl: token ? "ghcr.io" : null,
    username: token ? requireEnv("GHCR_USERNAME") : null,
    password: token ?? null,
  });
  await dokploy("application.saveEnvironment", {
    applicationId,
    env: envText(app.env),
    buildArgs: null,
    buildSecrets: null,
    createEnvFile: false,
  });
  await ensureDomain(applicationId, app.host, app.port);
  await dokploy("application.deploy", { applicationId });
  // project.all leaves appName off its rows, and it is the swarm service name other apps dial.
  const { appName } = await query("application.one", { applicationId });
  if (!appName) throw new Error(`dokploy returned no appName for ${app.name}`);
  return { ...app, applicationId, appName, projectId: environment.projectId };
}

async function waitForApp(app, onChange) {
  const started = Date.now();
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const { applicationStatus } = await query("application.one", { applicationId: app.applicationId });
    if (applicationStatus === "done" || applicationStatus === "error") {
      app.status = applicationStatus === "done" ? "ready" : "failed";
      await onChange();
      return app.status === "ready";
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  app.status = "failed";
  await onChange();
  return false;
}

const inspectUrl = (app) => `${DOKPLOY_PUBLIC_URL}/dashboard/project/${app.projectId}/services/application/${app.applicationId}`;

const STATUS = { building: "🔄 Building", deploying: "🚀 Deploying", ready: "✅ Ready", failed: "❌ Failed", deleted: "🗑 Deleted" };

function formatUpdated(date) {
  return date
    .toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    .replace(" AM", "am")
    .replace(" PM", "pm");
}

/** This workflow run's page: the image build and every step's log. */
function buildLogUrl() {
  const { GITHUB_SERVER_URL = "https://github.com", GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return GITHUB_REPOSITORY && GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : null;
}

// Vercel's layout: one row per project, the latest status, the logs, and the Preview link once it's up.
function renderComment(row) {
  const logs = [buildLogUrl() && `[Build logs](${buildLogUrl()})`, row.applicationId && `[Deploy logs](${inspectUrl(row)})`].filter(
    Boolean,
  );
  const inspect = logs.length && row.status !== "deleted" ? ` (${logs.join(" · ")})` : "";
  const name = row.applicationId ? `[${row.name}](${inspectUrl(row)})` : row.name;
  const preview = row.status === "ready" ? `[Visit Preview](https://${row.host})` : "";
  return [
    COMMENT_MARKER,
    "**The latest updates on your projects**. Learn more about [keep-player previews](../blob/main/docs/previews.md).",
    "",
    "| Project | Deployment | Actions | Updated (UTC) |",
    "| :--- | :----- | :------ | :------ |",
    `| ${name} | ${STATUS[row.status]}${inspect} | ${preview} | ${formatUpdated(new Date())} |`,
    ...(row.status === "ready"
      ? [
          "",
          `Sign in with \`${DEMO_USER}\` / \`${DEMO_PASSWORD}\`. The preview is isolated: its own empty data, a generated demo library, no production data.`,
        ]
      : []),
  ].join("\n");
}

async function github(path, init = {}) {
  const res = await fetch(`${process.env.GITHUB_API_URL || "https://api.github.com"}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${requireEnv("GITHUB_TOKEN")}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`github ${path} ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function upsertComment(row) {
  const repo = requireEnv("GITHUB_REPOSITORY");
  const pr = requireEnv("PR_NUMBER");
  const body = renderComment(row);
  const comments = await github(`/repos/${repo}/issues/${pr}/comments?per_page=100`);
  const existing = comments.find((c) => c.body?.startsWith(COMMENT_MARKER));
  if (existing)
    return void (await github(`/repos/${repo}/issues/comments/${existing.id}`, { method: "PATCH", body: JSON.stringify({ body }) }));
  await github(`/repos/${repo}/issues/${pr}/comments`, { method: "POST", body: JSON.stringify({ body }) });
}

async function previewUp() {
  const pr = requireEnv("PR_NUMBER");
  const tag = `pr-${pr}`;
  const host = previewHost(pr);
  const environment = await ensureEnvironment();
  const demo = environment.applications?.find((a) => a.name === DEMO_APP);
  if (!demo) throw new Error(`${DEMO_APP} isn't deployed yet: run the Demo workflow first (docs/previews.md)`);
  const { appName: demoName } = await query("application.one", { applicationId: demo.applicationId });
  const row = { name: `keep-player-${tag}`, status: "building", host };
  await upsertComment(row);
  const deployed = await deployApp(environment, {
    name: row.name,
    image: `ghcr.io/findmalek/keep-player:${tag}`,
    host,
    port: 8080,
    // A fresh data dir per preview (no volume), so sessions, history and the search index never come from production.
    env: {
      NAVIDROME_URL: `http://${demoName}:4533`,
      TRUST_PROXY: "true",
      LRCLIB_URL: "",
      LYRICS_BACKFILL: "off",
      SESSION_SECRET: randomBytes(24).toString("hex"),
      // The demo account also runs the background jobs, and gets months of generated listening to show.
      INDEX_USER: DEMO_USER,
      INDEX_PASSWORD: DEMO_PASSWORD,
      DEMO_SEED: "on",
    },
  });
  Object.assign(row, deployed, { status: "deploying" });
  await upsertComment(row);
  if (!(await waitForApp(row, () => upsertComment(row)))) process.exitCode = 1;
}

async function previewDown() {
  const pr = requireEnv("PR_NUMBER");
  const name = `keep-player-pr-${pr}`;
  const environment = (await findProject())?.environments?.[0];
  const app = environment?.applications?.find((a) => a.name === name);
  if (!app) return;
  await dokploy("application.delete", { applicationId: app.applicationId });
  await upsertComment({ name, status: "deleted" });
}

// `player-pr-<n>`: other repos' previews share the domain and already use `pr-<n>`.
function previewHost(pr) {
  return `player-pr-${pr}.${requireEnv("PREVIEW_DOMAIN")}`;
}

/** First thing in the job, before the image builds: the PR shows "Building" with the build log right away. */
async function commentBuilding() {
  const pr = requireEnv("PR_NUMBER");
  await upsertComment({ name: `keep-player-pr-${pr}`, status: "building", host: previewHost(pr) });
}

async function commentFailed() {
  await upsertComment({ name: `keep-player-pr-${requireEnv("PR_NUMBER")}`, status: "failed" });
}

// Navidrome imports playlists only once an admin exists, and the first scan ran before the demo account did: scan again.
async function rescan(host) {
  const salt = randomBytes(8).toString("hex");
  const token = createHash("md5")
    .update(DEMO_PASSWORD + salt)
    .digest("hex");
  const query = new URLSearchParams({ u: DEMO_USER, t: token, s: salt, v: "1.16.1", c: "keep-player-deploy", f: "json" });
  const res = await fetch(`https://${host}/rest/startScan?${query}`).catch(() => null);
  console.info(`demo rescan: ${res?.status ?? "unreachable"}`);
}

// The shared demo Navidrome: image with the generated library, and the `demo` account created on its first start.
async function demoUp() {
  const environment = await ensureEnvironment();
  const host = requireEnv("DEMO_HOST");
  const app = await deployApp(environment, {
    name: DEMO_APP,
    image: `ghcr.io/findmalek/${DEMO_APP}:latest`,
    host,
    port: 4533,
    env: {},
  });
  const row = { ...app, status: "building" };
  if (!(await waitForApp(row, async () => {}))) throw new Error("the demo Navidrome didn't come up");
  // Navidrome's first-run endpoint creates the admin once; a later call just answers that one exists.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const res = await fetch(`https://${host}/auth/createAdmin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: DEMO_USER, password: DEMO_PASSWORD }),
    }).catch(() => null);
    if (res && res.status < 500) {
      console.info(`demo account: ${res.status}`);
      return rescan(host);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("couldn't reach the demo Navidrome to create the demo account");
}

const MODES = {
  "comment-building": commentBuilding,
  "preview-up": previewUp,
  "preview-down": previewDown,
  "comment-failed": commentFailed,
  "demo-up": demoUp,
};
const run = MODES[MODE];
if (!run) {
  console.error(`unknown mode "${MODE}", expected ${Object.keys(MODES).join(" | ")}`);
  process.exit(1);
}
await run();
