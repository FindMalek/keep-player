/** The roadmap, read from GitHub so it never goes stale: releases, the open milestone, open epics, and `later` ideas. */

const API = "https://api.github.com/repos/FindMalek/keep-player";
const HOUR = 3600;

export interface Item {
  number: number;
  title: string;
  url: string;
}

export interface Release {
  tag: string;
  date: string;
  url: string;
  /** The release notes' change lines, conventional prefixes and links stripped. */
  changes: string[];
}

export interface Roadmap {
  shipped: Release[];
  now: { milestone: string; done: number; open: Item[] } | null;
  next: Item[];
  later: Item[];
}

async function get<T>(url: string): Promise<T | null> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  // Without a token GitHub allows 60 requests an hour per address: plenty at one refresh an hour, a token just helps.
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(url.startsWith("https://") ? url : `${API}${url}`, { headers, next: { revalidate: HOUR } }).catch(
    () => null,
  );
  return response?.ok ? ((await response.json()) as T) : null;
}

interface Issue {
  number: number;
  title: string;
  html_url: string;
  pull_request?: unknown;
}

const items = (issues: Issue[] | null): Item[] =>
  (issues ?? [])
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title.replace(/^\[Epic\]\s*/i, "").replace(/\s*\(later\)/i, ""),
      url: issue.html_url,
    }));

/** "* **player:** daily mixes ([#198](…)) ([abc123](…))" → "player: daily mixes". */
function changes(body: string): string[] {
  return body
    .split("\n")
    .filter((line) => /^\s*[*-] /.test(line))
    .map((line) =>
      line
        .replace(/^\s*[*-]\s+/, "")
        .replace(/\*\*/g, "")
        .replace(/\s*\(\[[^\]]+\]\([^)]+\)\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 8);
}

export async function roadmap(): Promise<Roadmap> {
  const [releases, milestones, epics, later] = await Promise.all([
    get<{ tag_name: string; published_at: string; html_url: string; body: string | null; draft: boolean }[]>("/releases?per_page=6"),
    get<{ number: number; title: string; open_issues: number; closed_issues: number }[]>("/milestones?state=open&sort=due_on"),
    get<{ items: Issue[] }>(
      `https://api.github.com/search/issues?q=${encodeURIComponent("repo:FindMalek/keep-player is:issue is:open [Epic] in:title")}`,
    ),
    get<Issue[]>("/issues?state=open&labels=later&per_page=50"),
  ]);
  // The newest open milestone is "now" (2.0 while 1.0 has leftovers).
  const milestone = milestones?.sort((a, b) => b.number - a.number)[0];
  const open = milestone ? await get<Issue[]>(`/issues?state=open&milestone=${milestone.number}&per_page=50`) : null;
  return {
    shipped: (releases ?? [])
      .filter((release) => !release.draft)
      .map((release) => ({
        tag: release.tag_name,
        date: release.published_at,
        url: release.html_url,
        changes: changes(release.body ?? ""),
      })),
    now: milestone ? { milestone: milestone.title, done: milestone.closed_issues, open: items(open) } : null,
    next: items(epics?.items ?? null),
    later: items(later),
  };
}
