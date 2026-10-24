import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { runChecks } from "@keep/shared/doctor";
import type { LyricsCoverage } from "@keep/shared/lyrics";
import type { LyricsSearch } from "@keep/shared/search";
import { readTrack } from "@keep/shared/spotify-import";
import type { Server } from "bun";
import type { Upstream } from "./config";
import { type CoverCache, snapCoverSize } from "./covers";
import { libraryItems } from "./doctor";
import { UpdateCheck } from "./health";
import { type NewPlay, readPlays, recordPlay } from "./history";
import { matchTrack } from "./import-match";
import { ListenRooms, type Peer } from "./listen";
import type { LyricsService } from "./lyrics";
import { forgetMisses, lyricsCoverageReport, missingLyrics } from "./lyrics-coverage";
import { lyricsCoverage, queryLyrics } from "./lyrics-search";
import { dailyMixes } from "./mixes";
import { addMoment, deleteMoment, listMoments, momentNotes, updateMoment } from "./moments";
import { changeAlbum, changeSong, readPrefs } from "./prefs";
import { ban, listBans, unban } from "./radio";
import type { LoginLimiter } from "./rate-limit";
import { search } from "./search";
import type { IndexSync } from "./search-index";
import type { Session, SessionStore } from "./sessions";
import { forgottenFavourites, listeningStats } from "./stats";
import { subsonic, upstreamQuery } from "./subsonic";
import { MAX_UPLOAD_BYTES, saveUpload, uploadPath } from "./upload";

const COOKIE = "kp_session";
const FOLDERS_TTL_MS = 10 * 60_000;
/** Requests that change or read data must carry this header. Cross-site pages can't set it without a CORS preflight. */
export const CSRF_HEADER = "x-keep-player";
const CLIENT_HEADER = "x-keep-client";

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
  "getPlayQueueByIndex",
  "savePlayQueueByIndex",
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
  /** Release check for admins (off unless `UPDATE_CHECK=on`). */
  updates?: UpdateCheck;
  /** Lyrics backfill per upstream id (absent when `LYRICS_BACKFILL=off`). */
  backfills?: Map<string, { restart(): void }>;
  /** The .lrc sidecar writer, when `LYRICS_WRITE_LRC=on`. */
  lrc?: { count(server: string): number; undoAll(server: string): { removed: number; kept: number } } | null;
  /** Where uploads land; null or missing turns them off. */
  uploadDir?: string | null;
  /** Listen-together rooms (#65). */
  rooms?: ListenRooms;
}

/** What a listen socket carries from the upgrade to its handlers. */
export interface ListenSocketData {
  code: string;
  session: string;
  user: string;
  server: string;
  peer?: Peer;
}

export function createApi({
  upstreams,
  covers,
  lyrics,
  indexes,
  library,
  sessions,
  limiter,
  idleSeconds,
  trustProxy,
  updates = new UpdateCheck(false),
  backfills = new Map(),
  lrc = null,
  rooms = new ListenRooms(),
  uploadDir = null,
}: ApiOptions) {
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

  // Each session's liked ids (songs, albums, artists) for search; dropped whenever it stars or unstars something.
  const likesCache = new Map<string, { liked: Set<string>; at: number }>();
  async function likesFor(session: Session, upstream: Upstream): Promise<Set<string>> {
    const cached = likesCache.get(session.id);
    if (cached && Date.now() - cached.at < FOLDERS_TTL_MS) return cached.liked;
    const result = await subsonic<{ starred2: Record<string, { id: string }[] | undefined> }>(upstream, session, "getStarred2");
    if (!result) return new Set();
    const liked = new Set(Object.values(result.starred2).flatMap((items) => (items ?? []).map((item) => item.id)));
    likesCache.set(session.id, { liked, at: Date.now() });
    return liked;
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
    if (!ping) return json({ error: "can't reach the music server", reason: "unreachable" }, 502);
    const result = (await ping.json().catch(() => null)) as {
      "subsonic-response"?: { status?: string; error?: { code?: number } };
    } | null;
    const answer = result?.["subsonic-response"];
    // Something answered, but not a Subsonic API: usually NAVIDROME_URL points at the wrong port or a web page.
    if (!answer)
      return json({ error: "the server answered, but it isn't Navidrome or another Subsonic server", reason: "not-subsonic" }, 502);
    if (answer.status !== "ok") {
      // 50: the account exists but may not use the API (disabled, or no access to this server).
      if (answer.error?.code === 50) return json({ error: "this account isn't allowed to sign in here", reason: "forbidden" }, 403);
      limiter.fail(keys);
      return json({ error: "wrong username or password", reason: "credentials" }, 401);
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
    // Long lists (a 1,000-song play queue) come as a form body: same params, no URL length limit on either hop.
    const form = request.method === "POST" ? new URLSearchParams(await request.text()) : null;
    if (form) for (const [name, value] of form) query.append(name, value);
    for (const name of STRIPPED) query.delete(name);
    for (const [name, value] of upstreamQuery(session)) query.set(name, value);
    // Each browser is its own Subsonic client ("keep-player@<id>"), so a play queue saved here is told apart from one
    // saved by Arpeggi or another browser (`changedBy`).
    const client = request.headers.get(CLIENT_HEADER);
    if (client && /^[a-z0-9-]{1,32}$/.test(client)) query.set("c", `keep-player@${client}`);

    const headers = new Headers();
    for (const name of ["range", "if-none-match", "if-modified-since"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const started = performance.now();
    const response = await (form
      ? fetch(`${upstream.url}/rest/${endpoint}`, {
          method: "POST",
          headers: { ...Object.fromEntries(headers), "content-type": "application/x-www-form-urlencoded" },
          body: query,
          redirect: "manual",
          signal: request.signal,
        })
      : // A stream the browser drops (skip, reload, preload change) must stop at Navidrome too, or it keeps serving it.
        fetch(`${upstream.url}/rest/${endpoint}?${query}`, { headers, redirect: "manual", signal: request.signal })
    ).catch(() => null);
    if (!response) return json({ error: "server unreachable" }, 502);
    const out = new Headers(SECURITY_HEADERS);
    // content-disposition: a download keeps the file's own name.
    for (const name of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified",
      "cache-control",
      "content-disposition",
    ]) {
      const value = response.headers.get(name);
      if (value) out.set(name, value);
    }
    // Responses depend on the session cookie, so shared caches must keep them per user.
    out.set("vary", "cookie");
    // Time to Navidrome's first byte, visible in the browser's network panel.
    out.set("server-timing", `upstream;dur=${(performance.now() - started).toFixed(1)}`);
    if (endpoint === "star" || endpoint === "unstar") likesCache.delete(session.id);
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

  /** `/api/lyrics/coverage`: how much of what this user may see has lyrics, and the albums missing the most. */
  async function lyricsCoverageRoute(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const upstream = upstreamFor(session.server);
    if (!upstream) return json({ error: "server removed from config" }, 401);
    const report: LyricsCoverage = lyricsCoverageReport(library, upstream.id, await foldersFor(session, upstream));
    if (session.admin && lrc) report.written = lrc.count(upstream.id);
    return json(report, 200, { "cache-control": "private, no-cache" });
  }

  /** `/api/doctor`: checks over the indexed library (covers, tags, duplicates…). Admins only. */
  async function doctorRoute(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    if (!session.admin) return json({ error: "admins only" }, 403);
    const upstream = upstreamFor(session.server);
    if (!upstream) return json({ error: "server removed from config" }, 401);
    const { songs, albums } = libraryItems(library, upstream.id);
    return json(runChecks(songs, albums), 200, { "cache-control": "private, no-cache" });
  }

  /** `POST /api/listen`: start a listening session hosted by this browser session. Returns its code. */
  async function listenCreate(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const body = (await request.json().catch(() => null)) as { anyoneCanSkip?: unknown } | null;
    const code = rooms.create(session.server, session.id, body?.anyoneCanSkip === true);
    return code ? json({ code }) : json({ error: "too many sessions" }, 429);
  }

  /** `GET /api/listen/:code` as a WebSocket: join (or, for its host, rejoin) the session. Same origin only. */
  function listenSocket(request: Request & { params: { code: string } }, srv: Server<ListenSocketData>): Response | undefined {
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    // Browsers can't add the CSRF header to a WebSocket: the Origin must be this site instead.
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== request.headers.get("host")) return json({ error: "bad origin" }, 403);
    const code = request.params.code;
    if (!rooms.has(code)) return json({ error: "no such session" }, 404);
    const data: ListenSocketData = { code, session: session.id, user: session.user, server: session.server };
    return srv.upgrade(request, { data }) ? undefined : json({ error: "upgrade failed" }, 400);
  }

  const listenSockets = {
    open(socket: { data: ListenSocketData; send(text: string): unknown; close(): void }) {
      const { code, session, user, server } = socket.data;
      const peer: Peer = { session, user, server, send: (text) => void socket.send(text) };
      socket.data.peer = peer;
      if (!rooms.join(code, peer)) socket.close();
    },
    message(socket: { data: ListenSocketData }, message: string | Buffer) {
      if (socket.data.peer && typeof message === "string") rooms.handle(socket.data.code, socket.data.peer, message);
    },
    close(socket: { data: ListenSocketData }) {
      if (socket.data.peer) rooms.leave(socket.data.code, socket.data.peer);
    },
  };

  /** `/api/lyrics/missing?offset=&limit=`: songs nobody found lyrics for, a page at a time. */
  async function lyricsMissing(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const upstream = upstreamFor(session.server);
    if (!upstream) return json({ error: "server removed from config" }, 401);
    const params = new URL(request.url).searchParams;
    const offset = Math.max(0, Number(params.get("offset")) || 0);
    const limit = Math.min(500, Math.max(1, Number(params.get("limit")) || 100));
    const songs = missingLyrics(library, upstream.id, await foldersFor(session, upstream), offset, limit);
    return json({ songs }, 200, { "cache-control": "private, no-cache" });
  }

  /** `POST /api/lyrics/refetch`: forget the misses and walk the library again now. Admins only. */
  async function lyricsRefetch(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    if (!session.admin) return json({ error: "admins only" }, 403);
    const forgotten = forgetMisses(library, session.server);
    const backfill = backfills.get(session.server);
    backfill?.restart();
    return json({ forgotten, backfill: Boolean(backfill) });
  }

  /**
   * `/api/upload`: whether uploads are on (GET), or one file into the upload folder (PUT, the raw bytes as the body,
   * `?path=Artist/Album/01 Song.flac`). Admins only; the importer or Navidrome's scan takes it from there.
   */
  async function upload(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    if (!session.admin) return json({ error: "admins only" }, 403);
    if (request.method === "GET") return json({ enabled: Boolean(uploadDir) });
    if (!uploadDir) return json({ error: "uploads are off (UPLOAD_DIR)" }, 404);
    const relative = new URL(request.url).searchParams.get("path") ?? "";
    const path = uploadPath(uploadDir, relative);
    if (!path) return json({ error: "not a music file" }, 400);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) return json({ error: "too big" }, 413);
    if (!request.body) return json({ error: "empty" }, 400);
    const saved = await saveUpload(path, request.body);
    return json({ saved: saved.slice(uploadDir.length + 1) });
  }

  /** `DELETE /api/lyrics/written`: remove every .lrc keep music wrote that is still as written. Admins only. */
  async function lyricsWritten(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    if (!session.admin) return json({ error: "admins only" }, 403);
    if (!lrc) return json({ error: "LYRICS_WRITE_LRC is off" }, 404);
    return json(lrc.undoAll(session.server));
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

  /** `/api/search?q=`: ranked songs, albums and artists with operators, limited to what this user may see. */
  async function searchLibrary(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const upstream = upstreamFor(session.server);
    if (!upstream) return json({ error: "server removed from config" }, 401);
    const params = new URL(request.url).searchParams;
    const query = (params.get("q") ?? "").slice(0, 200);
    const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 8));
    const [folders, liked] = await Promise.all([foldersFor(session, upstream), likesFor(session, upstream)]);
    const moments = /\b(moment:|is:moment)/i.test(query) ? momentNotes(library, `${session.server}:${session.user}`) : undefined;
    return json(search(library, upstream.id, query, { folders, liked, moments }, limit), 200, { "cache-control": "private, no-cache" });
  }

  /** `/api/import/match`: POST up to 200 tracks from a Spotify export; each comes back with its best library match. */
  async function importMatch(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const upstream = upstreamFor(session.server);
    if (!upstream) return json({ error: "server removed from config" }, 401);
    const body = (await request.json().catch(() => null)) as { tracks?: unknown } | null;
    if (!Array.isArray(body?.tracks) || body.tracks.length > 200) return json({ error: "send up to 200 tracks" }, 400);
    const tracks = body.tracks.map((raw) => readTrack(raw));
    const folders = await foldersFor(session, upstream);
    const matches = tracks.map((track) => (track ? matchTrack(library, upstream.id, folders, track) : { best: null, alternatives: [] }));
    return json({ matches }, 200, { "cache-control": "private, no-store" });
  }

  /** `/api/version`: the running version, and for admins whether a newer release is out. */
  async function version(request: Request): Promise<Response> {
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const info = await updates.info();
    return json(session.admin ? info : { version: info.version, latest: null, updateAvailable: false }, 200, {
      "cache-control": "private, no-cache",
    });
  }

  /** `/api/history`: GET your plays (newest first, `?before=` to page back), POST one that just ended. */
  async function history(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const account = `${session.server}:${session.user}`;
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      const before = Number(params.get("before")) || Date.now() + 1;
      const limit = Math.min(500, Math.max(1, Number(params.get("limit")) || 200));
      return json({ plays: readPlays(library, account, before, limit) }, 200, { "cache-control": "private, no-cache" });
    }
    const body = (await request.json().catch(() => null)) as Partial<NewPlay> | null;
    const valid =
      body &&
      typeof body.song?.id === "string" &&
      typeof body.started === "number" &&
      typeof body.listened === "number" &&
      body.listened >= 0 &&
      body.listened < 86_400;
    if (!valid) return json({ error: "song, started, listened" }, 400);
    recordPlay(library, account, request.headers.get(CLIENT_HEADER) ?? "", { ...(body as NewPlay), finished: Boolean(body.finished) });
    return json({ ok: true });
  }

  /** `/api/moments`: your moments (GET, `?song=` for one song's), or save one (POST `{ song, at, note }`). */
  async function moments(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const account = `${session.server}:${session.user}`;
    if (request.method === "GET")
      return json({ moments: listMoments(library, account, new URL(request.url).searchParams.get("song") ?? undefined) }, 200, {
        "cache-control": "private, no-cache",
      });
    const body = (await request.json().catch(() => null)) as { song?: { id?: unknown }; at?: unknown; note?: unknown } | null;
    if (typeof body?.song?.id !== "string" || typeof body.at !== "number" || !Number.isFinite(body.at) || body.at < 0 || body.at > 86_400)
      return json({ error: "song, at" }, 400);
    const moment = addMoment(library, account, body.song as { id: string }, body.at, typeof body.note === "string" ? body.note : "");
    return json(moment, 201);
  }

  /** `/api/moments/:id`: change its note (PATCH `{ note }`) or delete it. */
  async function moment(request: Request & { params: { id: string } }): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const account = `${session.server}:${session.user}`;
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404);
    if (request.method === "DELETE") return deleteMoment(library, account, id) ? json({ ok: true }) : json({ error: "not found" }, 404);
    const body = (await request.json().catch(() => null)) as { note?: unknown } | null;
    if (typeof body?.note !== "string") return json({ error: "note" }, 400);
    return updateMoment(library, account, id, body.note) ? json({ ok: true }) : json({ error: "not found" }, 404);
  }

  /** `/api/settings`: your synced preferences (GET), or replace them (PUT, a JSON object under 8 KB). */
  async function userSettings(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const account = `${session.server}:${session.user}`;
    if (request.method === "PUT") {
      const text = await request.text();
      if (text.length > 8192) return json({ error: "too large" }, 413);
      const body = (() => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return null;
        }
      })();
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "an object" }, 400);
      library
        .query("insert or replace into user_settings (account, body, updated) values (?, ?, ?)")
        .run(account, JSON.stringify(body), Date.now());
    }
    const row = library
      .query<{ body: string; updated: number }, [string]>("select body, updated from user_settings where account = ?")
      .get(account);
    return json(row ? { settings: JSON.parse(row.body), updated: row.updated } : { settings: null, updated: 0 }, 200, {
      "cache-control": "private, no-cache",
    });
  }

  /** `/api/prefs`: your per-song and per-album playback rules (trims, never in shuffle, keep in order, hidden). */
  async function prefs(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    return json(readPrefs(library, `${session.server}:${session.user}`), 200, { "cache-control": "private, no-cache" });
  }

  /** `PUT /api/prefs/songs/:id` or `/albums/:id`: change the fields sent (null clears a trim). */
  async function setPref(request: Request & { params: { kind: string; id: string } }): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const account = `${session.server}:${session.user}`;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return json({ error: "an object" }, 400);
    const flag = (value: unknown) => (typeof value === "boolean" ? value : undefined);
    if (request.params.kind === "songs") {
      const song =
        body.song && typeof (body.song as { id?: unknown }).id === "string"
          ? (body.song as { id: string } & Record<string, unknown>)
          : undefined;
      const ok = changeSong(library, account, request.params.id, {
        ...(song ? { song } : {}),
        ...("trimStart" in body ? { trimStart: body.trimStart as number | null } : {}),
        ...("trimEnd" in body ? { trimEnd: body.trimEnd as number | null } : {}),
        never: flag(body.never),
        hidden: flag(body.hidden),
      });
      if (!ok) return json({ error: "invalid trim" }, 400);
    } else if (request.params.kind === "albums") {
      changeAlbum(library, account, request.params.id, {
        name: typeof body.name === "string" ? body.name : undefined,
        keepOrder: flag(body.keepOrder),
        never: flag(body.never),
      });
    } else return json({ error: "not found" }, 404);
    return json(readPrefs(library, account));
  }

  /** `/api/radio/bans`: songs no radio plays for you (GET), ban one (POST `{ song }`), or lift one (DELETE `?id=`). */
  async function radioBans(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const account = `${session.server}:${session.user}`;
    if (request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { song?: { id?: unknown } & Record<string, unknown> } | null;
      if (typeof body?.song?.id !== "string") return json({ error: "song" }, 400);
      ban(library, account, body.song as { id: string } & Record<string, unknown>);
    } else if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id");
      if (!id) return json({ error: "id" }, 400);
      unban(library, account, id);
    }
    return json({ songs: listBans(library, account) }, 200, { "cache-control": "private, no-cache" });
  }

  /** `/api/stats?from=&to=&tz=`: your listening in a range (ms epoch, `tz` minutes east of UTC). At most ~400 days. */
  async function stats(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const params = new URL(request.url).searchParams;
    const to = Number(params.get("to")) || Date.now();
    const from = Math.max(Number(params.get("from")) || to - 30 * 86_400_000, to - 400 * 86_400_000);
    const tz = Math.max(-840, Math.min(840, Number(params.get("tz")) || 0));
    if (from >= to) return json({ error: "from before to" }, 400);
    return json(listeningStats(library, `${session.server}:${session.user}`, from, to, tz), 200, { "cache-control": "private, no-cache" });
  }

  /** `/api/stats/forgotten?days=`: songs you played a lot and not in that many days. */
  async function forgotten(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const days = Math.min(3650, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 60));
    return json({ songs: forgottenFavourites(library, `${session.server}:${session.user}`, days) }, 200, {
      "cache-control": "private, no-cache",
    });
  }

  /** `GET /api/mixes?day=N`: today's daily mixes for you (`day` = the browser's local days since the epoch). */
  async function mixes(request: Request): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const day = Number(new URL(request.url).searchParams.get("day")) || Math.floor(Date.now() / 86_400_000);
    return json({ day, mixes: dailyMixes(library, session.server, `${session.server}:${session.user}`, day) }, 200, {
      "cache-control": "private, no-cache",
    });
  }

  /** `/api/playlists/:id/hidden`: the songs you hid in a playlist (GET), hide or show one (PUT `{ songId, hidden }`). */
  async function playlistHidden(request: Request & { params: { id: string } }): Promise<Response> {
    if (request.headers.get(CSRF_HEADER) !== "1") return json({ error: "missing header" }, 403);
    const session = sessions.get(cookieValue(request));
    if (!session) return json({ error: "signed out" }, 401);
    const account = `${session.server}:${session.user}`;
    const playlist = request.params.id;
    if (request.method === "PUT") {
      const body = (await request.json().catch(() => null)) as { songId?: unknown; hidden?: unknown } | null;
      if (typeof body?.songId !== "string" || typeof body.hidden !== "boolean") return json({ error: "songId, hidden" }, 400);
      if (body.hidden)
        library
          .query("insert or ignore into playlist_hidden (account, playlist_id, song_id) values (?, ?, ?)")
          .run(account, playlist, body.songId);
      else
        library
          .query("delete from playlist_hidden where account = ? and playlist_id = ? and song_id = ?")
          .run(account, playlist, body.songId);
    }
    const songs = library
      .query<{ song_id: string }, [string, string]>("select song_id from playlist_hidden where account = ? and playlist_id = ?")
      .all(account, playlist)
      .map((row) => row.song_id);
    return json({ songs }, 200, { "cache-control": "private, no-cache" });
  }

  return {
    history,
    radioBans,
    prefs,
    setPref,
    userSettings,
    moments,
    moment,
    stats,
    forgotten,
    mixes,
    playlistHidden,
    login,
    logout,
    current,
    version,
    listSessions,
    revokeSession,
    proxy,
    cover,
    songLyrics,
    lyricsOffset,
    lyricsCoverage: lyricsCoverageRoute,
    lyricsMissing,
    doctor: doctorRoute,
    listenCreate,
    listenSocket,
    listenSockets,
    lyricsRefetch,
    lyricsWritten,
    upload,
    searchIndex,
    searchLyrics,
    searchLibrary,
    importMatch,
  };
}
