const API = "https://api.github.com/repos/FindMalek/keep-player";
const HOUR = 3600;

export interface Item {
  number: number;
  title: string;
  url: string;
}

interface Release {
  tag: string;
  date: string;
  url: string;
  changes: string[];
}

export interface Roadmap {
  shipped: Release[];
  now: { milestone: string; done: number; open: Item[] } | null;
  next: Item[];
  later: Item[];
}

// Throws after the build so ISR keeps the last good page; at build time it renders what it got instead of failing the deploy.
async function get<T>(url: string): Promise<T | null> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  // Without a token GitHub allows 60 requests an hour per address: plenty at one refresh an hour, a token just helps.
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(url.startsWith("https://") ? url : `${API}${url}`, { headers, next: { revalidate: HOUR } }).catch(
    () => null,
  );
  if (response?.ok) return (await response.json()) as T;
  if (process.env.NEXT_PHASE === "phase-production-build") return null;
  throw new Error(`github ${response?.status ?? "unreachable"}: ${url}`);
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
    // The search ignores the brackets in "[Epic]", so an epic in the milestone also matches: it shows once, under now.
    next: items(epics?.items ?? null).filter((item) => !open?.some((issue) => issue.number === item.number)),
    later: items(later),
  };
}
