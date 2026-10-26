/**
 * The site's docs come from the repo's own `docs/` (which stay readable on GitHub, and two of which are generated from
 * the code): each `.md` is copied into `content/docs` with its first heading as the title, its first paragraph as the
 * description (moved out of the body), links between docs pointing at `/docs/...`, and everything else (images, compose files) at GitHub.
 * Runs before dev and build; `content/docs` is generated, never edited.
 */
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

/** The sidebar, by section. A folder's README becomes its index. */
const META: Record<string, { title: string; pages: string[] }> = {
  "": {
    title: "docs",
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
  deploy: { title: "deploy", pages: ["index", "dokploy"] },
  ci: { title: "ci", pages: ["self-hosted-runner", "runner-performance"] },
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
  if (!block) return undefined;
  const text = block
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { text, block };
}

const yaml = (value: string) => JSON.stringify(value);
// Fence languages the site's highlighter doesn't know, shown as plain text.
const plainFences = (markdown: string) => markdown.replace(/^(\s*```)caddy\b/gm, "$1text");

rmSync(OUT, { recursive: true, force: true });
for (const file of files(SOURCE)) {
  const fromDocs = relative(SOURCE, file).split("\\").join("/");
  if (SKIP.has(fromDocs)) continue;
  const raw = readFileSync(file, "utf8");
  const heading = raw.match(/^#\s+(.+)$/m);
  const title = heading?.[1]?.trim() ?? fromDocs.replace(/\.md$/, "");
  const full = plainFences(rewrite(heading ? raw.replace(heading[0], "").trimStart() : raw, fromDocs));
  const lead = intro(full);
  const body = lead ? full.replace(lead.block, "").trimStart() : full;
  const summary = lead?.text;
  const target = join(OUT, (RENAME[fromDocs] ?? fromDocs).replace(/(^|\/)README\.md$/, "$1index.md"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `---\ntitle: ${yaml(title)}\n${summary ? `description: ${yaml(summary)}\n` : ""}---\n\n${body}`);
}
for (const [folder, meta] of Object.entries(META)) writeFileSync(join(OUT, folder, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
console.info(`docs: synced into ${relative(ROOT, OUT)}`);
