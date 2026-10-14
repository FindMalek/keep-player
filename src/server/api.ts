import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import type { Server } from "bun";
import type { LyricsSearch } from "../shared/search";
import type { Upstream } from "./config";
import { type CoverCache, snapCoverSize } from "./covers";
import type { LyricsService } from "./lyrics";
import { lyricsCoverage, queryLyrics } from "./lyrics-search";
import type { LoginLimiter } from "./rate-limit";
import type { IndexSync } from "./search-index";
import type { Session, SessionStore } from "./sessions";
import { subsonic, upstreamQuery } from "./subsonic";

const COOKIE = "kp_session";
const FOLDERS_TTL_MS = 10 * 60_000;
/** Requests that change or read data must carry this header. Cross-site pages can't set it without a CORS preflight. */
export const CSRF_HEADER = "x-keep-player";

/** Subsonic endpoints the app uses. Anything else is refused, so the proxy can't be used as a general API gateway. */
const ENDPOINTS = new Set([
  "ping",
  "getLicense",
  "getOpenSubsonicExtensions",
  "getUser",
  "getMusicFolders",
  "getScanStatus",
  "getAlbumList2",
  "getAlbum",
  "getAlbumInfo2",
  "getArtists",
  "getArtist",
  "getArtistInfo2",
  "getTopSongs",
  "getSong",
  "getSimilarSongs2",
  "getRandomSongs",
  "getSongsByGenre",
  "getGenres",
  "getIndexes",
  "getMusicDirectory",
  "search3",
  "getStarred2",
  "star",
  "unstar",
  "setRating",
  "scrobble",
  "getNowPlaying",
  "getPlayQueue",
  "savePlayQueue",
  "getPlaylists",
  "getPlaylist",
  "createPlaylist",
  "updatePlaylist",
  "deletePlaylist",
  "getLyricsBySongId",
  "getLyrics",
  "getCoverArt",
  "getAvatar",
  "stream",
  "download",
]);
/** Loaded by <img>/<audio>, which can't send headers; all read-only. */
const MEDIA = new Set(["getCoverArt", "getAvatar", "stream", "download"]);
/** Credentials or client identity a browser might try to pass through; the proxy always sets its own. */
const STRIPPED = ["u", "p", "t", "s", "apiKey", "c", "v"];

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...SECURITY_HEADERS, "cache-control": "no-store", ...headers } });
}

function cookieValue(request: Request): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=");
  }
  return undefined;
}

function secure(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

function sessionCookie(request: Request, value: string, maxAgeSeconds: number): string {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure(request) ? "; Secure" : ""}`;
}

/** Subsonic token auth: md5(password + salt). */
function tokenFor(password: string): { token: string; salt: string } {
  const salt = randomBytes(8).toString("hex");
  return {
    salt,
    token: createHash("md5")
      .update(password + salt)
      .digest("hex"),
  };
}

export interface ApiOptions {
  upstreams: Upstream[];
  covers: CoverCache;
  lyrics: LyricsService;
  /** Search index sync per upstream id. */
  indexes: Map<string, IndexSync>;
  /** library.db: lyrics cache and search index. */
  library: Database;
  sessions: SessionStore;
  limiter: LoginLimiter;
  idleSeconds: number;
  trustProxy: boolean;
}

export function createApi({ upstreams, covers, lyrics, indexes, library, sessions, limiter, idleSeconds, trustProxy }: ApiOptions) {
  const upstreamFor = (id: string) => upstreams.find((upstream) => upstream.id === id);

  // The music folders (libraries) each session may see, asked as that user so Navidrome decides. Ten minutes.
  const folderCache = new Map<string, { folders: string[]; at: number }>();
  async function foldersFor(session: Session, upstream: Upstream): Promise<string[]> {
    const cached = folderCache.get(session.id);
    if (cached && Date.now() - cached.at < FOLDERS_TTL_MS) return cached.folders;
    const result = await subsonic<{ musicFolders: { musicFolder?: { id: number | string }[] } }>(upstream, session, "getMusicFolders");
    // Unknown means nothing: never widen access because Navidrome didn't answer.
    if (!result) return [];
    const folders = (result.musicFolders.musicFolder ?? []).map((folder) => String(folder.id));
    folderCache.set(session.id, { folders, at: Date.now() });
    return folders;
  }

  function clientIp(request: Request, server: Server<unknown>): string {
    if (trustProxy) {
      const forwarded = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0];
      if (forwarded?.trim()) return forwarded.trim();
    }
    return server.requestIP(request)?.address ?? "unknown";
  }

  async function login(request: Request, server: Server<unknown>): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const body = (await request.json().catch(() => null)) as { user?: unknown; password?: unknown; server?: unknown } | null;
    if (typeof body?.user !== "string" || typeof body.password !== "string" || !body.user.trim())
      return json({ error: "username and password required" }, 400);
    const user = body.user.trim();
    const upstream = typeof body.server === "string" ? upstreamFor(body.server) : upstreams[0];
    if (!upstream) return json({ error: "unknown server" }, 400);

    const keys = [`ip:${clientIp(request, server)}`, `user:${upstream.id}:${user.toLowerCase()}`];
    const wait = limiter.retryAfter(keys);
    if (wait) return json({ error: `too many attempts, try again in ${wait} s` }, 429, { "retry-after": String(wait) });

    const { token, salt } = tokenFor(body.password);
    const query = upstreamQuery({ user, token, salt });
    query.set("f", "json");
    const ping = await fetch(`${upstream.url}/rest/ping?${query}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!ping) return json({ error: "server unreachable" }, 502);
    const result = ping.ok ? ((await ping.json().catch(() => null)) as { "subsonic-response"?: { status?: string } } | null) : null;
    if (result?.["subsonic-response"]?.status !== "ok") {
      limiter.fail(keys);
      return json({ error: "wrong username or password" }, 401);
    }
    limiter.succeed(keys);
    // Admins' sessions can run the background jobs (lyrics backfill, search index) when no service account is set.
    const profile = await subsonic<{ user?: { adminRole?: boolean } }>(upstream, { user, token, salt }, "getUser", { username: user });
    const cookie = sessions.create({
      server: upstream.id,
      user,
      token,
      salt,
      agent: request.headers.get("user-agent") ?? "",
      admin: Boolean(profile?.user?.adminRole),
    });
    return json({ user, server: upstream.id }, 200, { "set-cookie": sessionCookie(request, cookie, idleSeconds) });
  }

  function logout(request: Request): Response {
    const cookie = cookieValue(request);
    if (cookie) sessions.delete(cookie);
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(request, "", 0) });
  }

  function current(request: Request): Response {
    const session = sessions.get(cookieValue(request));
    return session
      ? json({ user: session.user, server: session.server, id: session.id, admin: session.admin })
      : json({ error: "signed out" }, 401);
  }

  function listSessions(request: Request): Response {
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    return json({ current: session.id, sessions: sessions.list(session.server, session.user) });
  }

  function revokeSession(request: Request & { params: { id: string } }): Response {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    return sessions.revoke(session.server, session.user, request.params.id) ? json({ ok: true }) : json({ error: "not found" }, 404);
  }

  /** Subsonic calls with the session's credentials added upstream. Keeps Range so audio can seek. */
  async function proxy(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const endpoint = /^\/rest\/(\w+?)(?:\.view)?$/.exec(url.pathname)?.[1];
    if (!endpoint || !ENDPOINTS.has(endpoint)) return json({ error: "not allowed" }, 404);
    if (!MEDIA.has(endpoint) && request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const upstream = upstreamFor(session.server);
    if (!upstream) return json({ error: "server removed from config" }, 401);

    const query = new URLSearchParams(url.search);
    for (const name of STRIPPED) query.delete(name);
    for (const [name, value] of upstreamQuery(session)) query.set(name, value);

    const headers = new Headers();
    for (const name of ["range", "if-none-match", "if-modified-since"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const started = performance.now();
    const response = await fetch(`${upstream.url}/rest/${endpoint}?${query}`, { headers, redirect: "manual" }).catch(() => null);
    if (!response) return json({ error: "server unreachable" }, 502);
    const out = new Headers(SECURITY_HEADERS);
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified", "cache-control"]) {
      const value = response.headers.get(name);
      if (value) out.set(name, value);
    }
    // Responses depend on the session cookie, so shared caches must keep them per user.
    out.set("vary", "cookie");
    // Time to Navidrome's first byte, visible in the browser's network panel.
    out.set("server-timing", `upstream;dur=${(performance.now() - started).toFixed(1)}`);
    return new Response(response.body, { status: response.status, headers: out });
  }

  /**
   * `/cover/:id/:size`: credential-free and size-snapped, so the URL is stable and the browser can keep it forever.
   * Navidrome's cover ids change when the art does, which is what makes `immutable` safe.
   */
  async function cover(request: Request & { params: { id: string; size: string } }): Promise<Response> {
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const upstream = upstreamFor(session.server);
    if (!upstream) return json({ error: "server removed from config" }, 401);
    const size = snapCoverSize(Number(request.params.size) || 256);
    const started = performance.now();
    const path = await covers.get(
      `${upstream.id}:${request.params.id}`,
      size,
      (id, wanted) => {
        const query = upstreamQuery(session);
        query.set("id", id);
        query.set("size", String(wanted));
        return fetch(`${upstream.url}/rest/getCoverArt?${query}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
      },
      request.params.id,
    );
    if (!path) return new Response(null, { status: 404, headers: { ...SECURITY_HEADERS, "cache-control": "private, max-age=3600" } });
    return new Response(Bun.file(path), {
      headers: {
        ...SECURITY_HEADERS,
        "content-type": "image/webp",
        "cache-control": "private, max-age=31536000, immutable",
        "server-timing": `cover;dur=${(performance.now() - started).toFixed(1)}`,
      },
    });
  }

  /** `/api/lyrics/:songId`: one shape whatever the source (Navidrome, LRCLIB), cached server-side. */
  async function songLyrics(request: Request & { params: { songId: string } }): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const upstream = upstreamFor(session.server);
    if (!upstream) return json({ error: "server removed from config" }, 401);
    const result = await lyrics.get(upstream, session, request.params.songId);
    return json(result, 200, { "cache-control": "private, no-cache" });
  }

  /** `/api/lyrics/:songId/offset`: this user's timing nudge (ms), GET and PUT `{ offset }`; it follows them everywhere. */
  async function lyricsOffset(request: Request & { params: { songId: string } }): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    if (request.method === "GET") return json({ offset: lyrics.offset(`${session.server}:${session.user}`, request.params.songId) });
    const body = (await request.json().catch(() => null)) as { offset?: unknown } | null;
    if (typeof body?.offset !== "number" || !Number.isFinite(body.offset) || Math.abs(body.offset) > 60_000)
      return json({ error: "offset in ms" }, 400);
    lyrics.setOffset(`${session.server}:${session.user}`, request.params.songId, body.offset);
    return json({ ok: true });
  }

  /** `/api/index`: the search index's counts and last sync (GET), or a rebuild now (POST). Admins only. */
  async function searchIndex(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    if (!session.admin) return json({ error: "admins only" }, 403);
    const index = indexes.get(session.server);
    if (!index) return json({ error: "no index for this server" }, 404);
    // Runs in the background; the client polls the status while `building`.
    if (request.method === "POST") void index.rebuild().catch(() => undefined);
    return json(index.status());
  }

  /** `/api/search/lyrics?q=`: songs by their words, in the folders this user may see, plus how much is indexed. */
  async function searchLyrics(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const upstream = upstreamFor(session.server);
    if (!upstream) return json({ error: "server removed from config" }, 401);
    const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 200);
    const hits = query.trim() ? queryLyrics(library, upstream.id, query, 8, await foldersFor(session, upstream)) : [];
    const body: LyricsSearch = { hits, ...lyricsCoverage(library, upstream.id) };
    return json(body, 200, { "cache-control": "private, no-cache" });
  }

  return { login, logout, current, listSessions, revokeSession, proxy, cover, songLyrics, lyricsOffset, searchIndex, searchLyrics };
}
