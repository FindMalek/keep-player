import { expect, test } from "bun:test";
import { fileFeedback, issueTitle } from "./feedback";

const feedback = {
  kind: "bug" as const,
  text: "the queue jumps when I drag a song\nsteps…",
  user: "malek",
  version: "1.2.0",
  page: "/queue",
};

test("a screenshot goes to the feedback branch, never the default one, and the issue links it", async () => {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ url, method: init.method ?? "GET", body });
    if (url.endsWith("/branches/feedback")) return new Response("", { status: 404 });
    if (url.endsWith("/repos/me/app")) return Response.json({ default_branch: "main" });
    if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: "abc" } });
    if (url.endsWith("/git/refs")) return Response.json({}, { status: 201 });
    if (url.includes("/contents/")) return Response.json({ content: { download_url: "https://raw/shot.png" } }, { status: 201 });
    if (url.endsWith("/issues")) return Response.json({ html_url: "https://github.com/me/app/issues/9" }, { status: 201 });
    return new Response("", { status: 500 });
  }) as unknown as typeof fetch;

  const url = await fileFeedback({ token: "t", repo: "me/app" }, { ...feedback, screenshot: { data: "AAAA", type: "image/png" } }, fake);
  expect(url).toBe("https://github.com/me/app/issues/9");
  expect(calls.find((call) => call.url.endsWith("/git/refs"))?.body).toEqual({ ref: "refs/heads/feedback", sha: "abc" });
  expect(calls.find((call) => call.url.includes("/contents/"))?.body?.branch).toBe("feedback");
  const issue = calls.find((call) => call.url.endsWith("/issues"))?.body;
  expect(issue?.title).toBe("bug: the queue jumps when I drag a song");
  expect(String(issue?.body)).toContain("![screenshot](https://raw/shot.png)");
});

test("a long first line is cut for the title", () => {
  const title = issueTitle({ ...feedback, kind: "idea", text: "x".repeat(100) });
  expect(title.startsWith("idea: ")).toBe(true);
  expect(title.endsWith("…")).toBe(true);
  expect(title.length).toBeLessThanOrEqual(76);
});
