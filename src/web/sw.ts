import { del, get, set } from "idb-keyval";

/*
 * Service worker: the app shell offline, covers cache-first, and the audio precache.
 *
 * The page tells it which songs come next (`precache`); it downloads them one at a time at low priority into the
 * `audio-v1` cache and serves `/rest/stream` from there, slicing the stored file for Range requests so seeking a
 * precached song is instant and works offline. An index in IndexedDB tracks sizes and last use; past the cap, the least
 * recently used songs go first, except ones kept offline (pinned albums and playlists).
 */

// Minimal service worker types (the WebWorker lib clashes with DOM in one TypeScript program).
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
}
interface Client {
  postMessage(message: unknown): void;
}
interface ExtendableMessageEvent extends ExtendableEvent {
  data: Message;
  source: Client | null;
}
declare const self: {
  addEventListener(type: "install" | "activate", listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void;
  addEventListener(type: "message", listener: (event: ExtendableMessageEvent) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void>; matchAll(options?: { includeUncontrolled?: boolean }): Promise<readonly Client[]> };
  location: Location;
};
/** Hashed app files and "/", injected by the build (empty in development). */
declare const __SHELL__: string[];
declare const __VERSION__: string;

export type Message =
  | { type: "precache"; ids: string[] }
  | { type: "drop"; id: string }
  | { type: "pause" | "resume" | "status" | "clear" }
  | { type: "pin"; group: string; ids: string[] }
  | { type: "unpin"; group: string }
  | { type: "cap"; bytes: number };

export interface Status {
  type: "status";
  ids: string[];
  bytes: number;
  cap: number;
  pinned: Record<string, string[]>;
}

const SHELL = `shell-${__VERSION__}`;
const AUDIO = "audio-v1";
const COVERS = "covers-v1";
const COVER_LIMIT = 2000;
const INDEX_KEY = "keep-player:audio-index";

interface Index {
  /** Song id → bytes and last use. */
  songs: Record<string, { bytes: number; used: number }>;
  pinned: Record<string, string[]>;
  cap: number;
}

const audioKey = (id: string) => `/rest/stream?id=${encodeURIComponent(id)}&format=raw`;

let index: Index | null = null;
async function loadIndex(): Promise<Index> {
  index ??= (await get<Index>(INDEX_KEY)) ?? { songs: {}, pinned: {}, cap: 2 * 1024 ** 3 };
  return index;
}
const saveIndex = async () => index && (await set(INDEX_KEY, index));

async function broadcast(): Promise<void> {
  const status = await statusMessage();
  for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage(status);
}

async function statusMessage(): Promise<Status> {
  const { songs, pinned, cap } = await loadIndex();
  const ids = Object.keys(songs);
  return { type: "status", ids, bytes: ids.reduce((sum, id) => sum + (songs[id]?.bytes ?? 0), 0), cap, pinned };
}

/** Drop least recently used songs until under the cap; pinned songs stay. */
async function evict(): Promise<void> {
  const current = await loadIndex();
  const pinned = new Set(Object.values(current.pinned).flat());
  let total = Object.values(current.songs).reduce((sum, song) => sum + song.bytes, 0);
  if (total <= current.cap) return;
  const cache = await caches.open(AUDIO);
  for (const [id, song] of Object.entries(current.songs).sort((a, b) => a[1].used - b[1].used)) {
    if (total <= current.cap * 0.9) break;
    if (pinned.has(id)) continue;
    await cache.delete(audioKey(id));
    delete current.songs[id];
    total -= song.bytes;
  }
}

// Downloads: one at a time, low priority, paused while the playing song is still buffering. Pausing also cancels the
// download in progress (it goes back to the front of the line): a 40 MB file finishing first would starve the song.
const wanted: string[] = [];
let paused = false;
let downloading = false;
let inflight: { id: string; controller: AbortController; dropped: boolean } | null = null;

function pauseDownloads(): void {
  paused = true;
  inflight?.controller.abort();
}

/** The page loads this song itself (the idle deck): forget it here, cancelling its download if it's the one running. */
function dropDownload(id: string): void {
  for (let at = wanted.indexOf(id); at >= 0; at = wanted.indexOf(id)) wanted.splice(at, 1);
  if (inflight?.id === id) {
    inflight.dropped = true;
    inflight.controller.abort();
  }
}

async function drain(): Promise<void> {
  if (downloading) return;
  downloading = true;
  try {
    while (!paused && wanted.length) {
      const id = wanted.shift() as string;
      const current = await loadIndex();
      if (current.songs[id]) continue;
      const controller = new AbortController();
      const running = { id, controller, dropped: false };
      inflight = running;
      const download = async () => {
        const response = await fetch(audioKey(id), {
          credentials: "same-origin",
          priority: "low",
          signal: controller.signal,
        } as RequestInit);
        return response.ok && response.status === 200 ? { blob: await response.blob(), type: response.headers.get("content-type") } : null;
      };
      const result = await download().catch(() => null);
      inflight = null;
      if (controller.signal.aborted) {
        // Paused: back to the front of the line. Dropped: the page has it.
        if (!running.dropped) wanted.unshift(id);
        continue;
      }
      if (!result) continue;
      const { blob } = result;
      await (await caches.open(AUDIO)).put(audioKey(id), new Response(blob, { headers: { "content-type": result.type ?? "audio/mpeg" } }));
      current.songs[id] = { bytes: blob.size, used: Date.now() };
      await evict();
      await saveIndex();
      await broadcast();
    }
  } finally {
    downloading = false;
  }
}

function queueDownloads(ids: string[], front = false): void {
  const fresh = ids.filter((id) => !wanted.includes(id));
  if (front) wanted.unshift(...fresh);
  else wanted.push(...fresh);
  void drain();
}

/** Serves a cached song, honoring Range so seeking works without the network. */
async function audioResponse(request: Request, id: string): Promise<Response> {
  const cached = await (await caches.open(AUDIO)).match(audioKey(id));
  if (!cached) return fetch(request);
  const current = await loadIndex();
  const entry = current.songs[id];
  if (entry) entry.used = Date.now();
  const blob = await cached.blob();
  const type = cached.headers.get("content-type") ?? "audio/mpeg";
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (!range || (!range[1] && !range[2]))
    return new Response(blob, { headers: { "content-type": type, "content-length": String(blob.size), "accept-ranges": "bytes" } });
  const start = range[1] ? Number(range[1]) : Math.max(0, blob.size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), blob.size - 1) : blob.size - 1;
  if (start >= blob.size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${blob.size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "content-type": type,
      "content-length": String(end - start + 1),
      "content-range": `bytes ${start}-${end}/${blob.size}`,
      "accept-ranges": "bytes",
    },
  });
}

async function coverResponse(request: Request): Promise<Response> {
  const cache = await caches.open(COVERS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - COVER_LIMIT))) await cache.delete(key);
  }
  return response;
}

/** Network first so a deploy shows at once; the cached shell when offline. */
async function navigation(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) await (await caches.open(SHELL)).put("/", response.clone());
    return response;
  } catch {
    return (await (await caches.open(SHELL)).match("/")) ?? Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      if (__SHELL__.length) await (await caches.open(SHELL)).addAll(__SHELL__);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("shell-") && key !== SHELL) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  if (event.request.mode === "navigate") event.respondWith(navigation(event.request));
  else if (url.pathname === "/rest/stream") event.respondWith(audioResponse(event.request, url.searchParams.get("id") ?? ""));
  else if (url.pathname.startsWith("/cover/")) event.respondWith(coverResponse(event.request));
  else if (__SHELL__.includes(url.pathname))
    event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});

self.addEventListener("message", (event) => {
  const message = event.data;
  event.waitUntil(
    (async () => {
      const current = await loadIndex();
      switch (message.type) {
        case "precache":
          queueDownloads(message.ids, true);
          break;
        case "pause":
          pauseDownloads();
          break;
        case "drop":
          dropDownload(message.id);
          break;
        case "resume":
          paused = false;
          void drain();
          break;
        case "pin":
          current.pinned[message.group] = message.ids;
          await saveIndex();
          queueDownloads(message.ids);
          break;
        case "unpin":
          delete current.pinned[message.group];
          await saveIndex();
          await evict();
          break;
        case "cap":
          current.cap = message.bytes;
          await evict();
          await saveIndex();
          break;
        case "clear":
          wanted.length = 0;
          await caches.delete(AUDIO);
          await caches.delete(COVERS);
          index = { songs: {}, pinned: {}, cap: current.cap };
          await del(INDEX_KEY);
          break;
      }
      await broadcast();
    })(),
  );
});
