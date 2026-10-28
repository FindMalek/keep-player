// GitHub's API can't attach an image to an issue, so screenshots are committed to a `feedback` branch
// (never the default one: no CI, no release) and linked from the issue.

export interface FeedbackTarget {
  token: string;
  repo: string;
}

export interface Feedback {
  kind: "bug" | "idea";
  text: string;
  user: string;
  version: string;
  page: string;
  /** base64 PNG or JPEG, without the data: prefix. */
  screenshot?: { data: string; type: "image/png" | "image/jpeg" };
}

const BRANCH = "feedback";
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

type Fetcher = typeof fetch;

function github(target: FeedbackTarget, fetcher: Fetcher) {
  return (path: string, init: { method?: string; body?: unknown } = {}) =>
    fetcher(`https://api.github.com/repos/${target.repo}${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${target.token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "lodesong",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(20_000),
    });
}

async function ensureBranch(call: ReturnType<typeof github>): Promise<boolean> {
  if ((await call(`/branches/${BRANCH}`)).ok) return true;
  const repo = (await (await call("")).json().catch(() => null)) as { default_branch?: string } | null;
  const base = repo?.default_branch
    ? ((await (await call(`/git/ref/heads/${repo.default_branch}`)).json()) as { object?: { sha?: string } })
    : null;
  if (!base?.object?.sha) return false;
  const made = await call("/git/refs", { method: "POST", body: { ref: `refs/heads/${BRANCH}`, sha: base.object.sha } });
  return made.ok || made.status === 422;
}

export function issueTitle(feedback: Feedback): string {
  const first = feedback.text.split("\n")[0]?.trim() ?? "";
  const short = first.length > 70 ? `${first.slice(0, 67).trimEnd()}…` : first;
  return `${feedback.kind === "bug" ? "bug" : "idea"}: ${short || "feedback"}`;
}

export async function fileFeedback(target: FeedbackTarget, feedback: Feedback, fetcher: Fetcher = fetch): Promise<string | null> {
  const call = github(target, fetcher);
  let image = "";
  if (feedback.screenshot && (await ensureBranch(call))) {
    const name = `screenshots/${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 6)}.${feedback.screenshot.type === "image/png" ? "png" : "jpg"}`;
    const put = await call(`/contents/${name}`, {
      method: "PUT",
      body: { message: `chore(feedback): screenshot from ${feedback.user}`, content: feedback.screenshot.data, branch: BRANCH },
    });
    const body = (await put.json().catch(() => null)) as { content?: { download_url?: string } } | null;
    if (put.ok && body?.content?.download_url) image = `\n\n![screenshot](${body.content.download_url})`;
  }
  const issue = await call("/issues", {
    method: "POST",
    body: {
      title: issueTitle(feedback),
      body: `${feedback.text.trim()}${image}\n\n---\nfrom the player: ${feedback.user} · v${feedback.version} · \`${feedback.page}\``,
      labels: [feedback.kind === "bug" ? "bug" : "enhancement", "feedback"],
    },
  });
  if (!issue.ok) return null;
  return ((await issue.json()) as { html_url?: string }).html_url ?? null;
}
