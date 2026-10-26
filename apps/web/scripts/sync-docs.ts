/**
 * The site's docs come from the repo's own `docs/` (which stay readable on GitHub, and two of which are generated from
 * the code): each `.md` is copied into `content/docs` with its first heading as the title, its first paragraph as the
 * description (moved out of the body), links between docs pointing at `/docs/...`, and everything else (images, compose files) at GitHub.
 * Runs before dev and build; `content/docs` is generated, never edited.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const SOURCE = join(ROOT, "docs");
const OUT = join(import.meta.dir, "../content/docs");
const BLOB = "https://github.com/FindMalek/keep-player/blob/main/docs";
const RAW = "https://raw.githubusercontent.com/FindMalek/keep-player/main/docs";
// The roadmap lives at /roadmap, read live from GitHub.
const SKIP = new Set(["ROADMAP.md"]);
// The start-to-finish guide is the docs' front page.
const RENAME: Record<string, string> = { "start-to-finish.md": "index.md" };

/** Per page: a shorter title where the heading is long (the page shows it too), and its sidebar icon (lib/source.ts). */
const PAGES: Record<string, { title?: string; icon: string }> = {
  "start-to-finish.md": { icon: "Map" },
  "getting-started.md": { icon: "Rocket" },
  "self-hosting.md": { icon: "Server" },
  "configuration.md": { icon: "Settings2" },
  "deploy/README.md": { title: "Deploy", icon: "Cloud" },
  "deploy/dokploy.md": { icon: "Container" },
  "troubleshooting.md": { icon: "LifeBuoy" },
  "devices.md": { icon: "MonitorSmartphone" },
  "sync.md": { title: "Your phone", icon: "Smartphone" },
  "listen-together.md": { icon: "Users" },
  "mixes.md": { title: "Mixes", icon: "Sparkles" },
  "search.md": { icon: "Search" },
  "lyrics.md": { icon: "MicVocal" },
  "shortcuts.md": { title: "Shortcuts", icon: "Keyboard" },
  "lyterion.md": { title: "Lyterion", icon: "Library" },
  "spotify-import.md": { title: "Spotify import", icon: "Import" },
  "api.md": { icon: "Braces" },
  "architecture.md": { icon: "Boxes" },
  "security.md": { icon: "ShieldCheck" },
  "demo-library.md": { icon: "Disc3" },
  "previews.md": { icon: "GitPullRequest" },
  "ci/self-hosted-runner.md": { title: "Self-hosted runner", icon: "Server" },
  "ci/runner-performance.md": { title: "Runner performance", icon: "Gauge" },
};

/** The sidebar, by section. A folder's README becomes its index. */
const META: Record<string, { title: string; description?: string; icon?: string; pages: string[] }> = {
  "": {
    title: "keep music docs",
    description: "How to run keep music next to Navidrome, use it, bring a Spotify library over with Lyterion, and build on its API.",
    pages: [
      "---start here---",
      "index",
      "getting-started",
      "self-hosting",
      "configuration",
      "deploy",
      "troubleshooting",
      "---using it---",
      "devices",
      "sync",
      "listen-together",
      "mixes",
      "search",
      "lyrics",
      "shortcuts",
      "---your library---",
      "lyterion",
      "spotify-import",
      "---building on it---",
      "api",
      "architecture",
      "security",
      "demo-library",
      "previews",
      "ci",
    ],
  },
  deploy: { title: "Deploy", icon: "Cloud", pages: ["index", "dokploy"] },
  ci: { title: "CI", icon: "Workflow", pages: ["self-hosted-runner", "runner-performance"] },
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return name.endsWith(".md") ? [path] : [];
  });
}

/** `docs/deploy/README.md` → `/docs/deploy`, `docs/start-to-finish.md` → `/docs`. */
function route(fromDocs: string): string {
  const renamed = RENAME[fromDocs] ?? fromDocs;
  const bare = renamed.replace(/(^|\/)(README|index)\.md$/, "").replace(/\.md$/, "");
  return `/docs${bare ? `/${bare}` : ""}`;
}

function rewrite(markdown: string, fromDocs: string): string {
  const here = posix.dirname(fromDocs);
  return markdown.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, bang: string, text: string, target: string) => {
    if (/^(https?:|mailto:|#|\/)/.test(target)) return whole;
    const [path = "", anchor] = target.split("#");
    const resolved = posix.normalize(posix.join(here, path));
    if (resolved.startsWith(".."))
      return `${bang}[${text}](https://github.com/FindMalek/keep-player/blob/main/${resolved.replace(/^(\.\.\/)+/, "")})`;
    if (bang) return `![${text}](${RAW}/${resolved})`;
    if (resolved.endsWith(".md")) return `[${text}](${route(resolved)}${anchor ? `#${anchor}` : ""})`;
    return `[${text}](${BLOB}/${resolved}${anchor ? `#${anchor}` : ""})`;
  });
}

/** The first real paragraph: it becomes the page's description (shown under the title), so the body drops it. */
function intro(body: string): { text: string; block: string } | undefined {
  const block = body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part && !/^(#|>|\||```|-|\*|\d+\.|<)/.test(part));
  // A paragraph that links somewhere stays in the body: the description is plain text and would lose the link.
  if (!block || /\]\(/.test(block)) return undefined;
  const text = block
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Emphasis and code marks only: underscores belong to names like NAVIDROME_URL.
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { text, block };
}

const yaml = (value: string) => JSON.stringify(value);

const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
// In a shallow clone every file older than the cut "changed" in the boundary commit, so no date beats a wrong one.
const SHALLOW = (() => {
  try {
    return git(["rev-parse", "--is-shallow-repository"]) === "true";
  } catch {
    return true;
  }
})();

/** When the source file last changed in git (ISO date); undefined outside a full git checkout or for a new file. */
function updated(file: string): string | undefined {
  if (SHALLOW) return undefined;
  try {
    return git(["log", "-1", "--format=%cs", "--", file]) || undefined;
  } catch {
    return undefined;
  }
}
// Fence languages the site's highlighter doesn't know, shown as plain text.
const plainFences = (markdown: string) => markdown.replace(/^(\s*```)caddy\b/gm, "$1text");

rmSync(OUT, { recursive: true, force: true });
for (const file of files(SOURCE)) {
  const fromDocs = relative(SOURCE, file).split("\\").join("/");
  if (SKIP.has(fromDocs)) continue;
  const raw = readFileSync(file, "utf8");
  const heading = raw.match(/^#\s+(.+)$/m);
  const title = PAGES[fromDocs]?.title ?? heading?.[1]?.trim() ?? fromDocs.replace(/\.md$/, "");
  const full = plainFences(rewrite(heading ? raw.replace(heading[0], "").trimStart() : raw, fromDocs));
  const lead = intro(full);
  const body = lead ? full.replace(lead.block, "").trimStart() : full;
  const summary = lead?.text;
  const target = join(OUT, (RENAME[fromDocs] ?? fromDocs).replace(/(^|\/)README\.md$/, "$1index.md"));
  mkdirSync(dirname(target), { recursive: true });
  const changed = updated(file);
  const frontmatter = [
    `title: ${yaml(title)}`,
    summary && `description: ${yaml(summary)}`,
    `source: ${yaml(`docs/${fromDocs}`)}`,
    PAGES[fromDocs] && `icon: ${yaml(PAGES[fromDocs].icon)}`,
    changed && `updated: ${yaml(changed)}`,
  ].filter(Boolean);
  writeFileSync(target, `---\n${frontmatter.join("\n")}\n---\n\n${body}`);
}
for (const [folder, meta] of Object.entries(META)) writeFileSync(join(OUT, folder, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
console.info(`docs: synced into ${relative(ROOT, OUT)}`);
