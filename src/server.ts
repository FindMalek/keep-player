import { createHash, randomBytes } from "node:crypto";
import index from "./web/index.html";

const PORT = Number(process.env.PORT ?? 8080);
const NAVIDROME = process.env.NAVIDROME_URL ?? "http://navidrome:4533";
const CLIENT = "keep-player";

/** Subsonic token auth: md5(password + salt). Done here so the browser never needs md5 or keeps the password. */
function tokenFor(password: string): { token: string; salt: string } {
  const salt = randomBytes(8).toString("hex");
  return { salt, token: createHash("md5").update(password + salt).digest("hex") };
}

async function login(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { user?: unknown; password?: unknown } | null;
  if (typeof body?.user !== "string" || typeof body.password !== "string") return new Response("bad request", { status: 400 });
  const { token, salt } = tokenFor(body.password);
  const query = new URLSearchParams({ u: body.user, t: token, s: salt, v: "1.16.1", c: CLIENT, f: "json" });
  const ping = await fetch(`${NAVIDROME}/rest/ping?${query}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const result = ping?.ok ? ((await ping.json()) as { "subsonic-response"?: { status?: string } })["subsonic-response"] : null;
  if (result?.status !== "ok") return new Response("wrong username or password", { status: 401 });
  return Response.json({ user: body.user, token, salt });
}

/** Pass Subsonic calls straight through, keeping Range headers so audio can seek. */
async function proxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers = new Headers();
  for (const name of ["range", "if-none-match", "if-modified-since"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upstream = await fetch(`${NAVIDROME}${url.pathname}${url.search}`, { method: request.method, headers, redirect: "manual" });
  const out = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified", "cache-control"]) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

const server = Bun.serve({
  port: PORT,
  development: process.env.NODE_ENV !== "production",
  // Long streams must not be cut by the idle timeout.
  idleTimeout: 0,
  routes: {
    "/healthz": () => new Response("ok"),
    "/auth/login": { POST: login },
    "/rest/*": proxy,
    "/*": index,
  },
});

console.log(`keep-player on :${server.port}`);
