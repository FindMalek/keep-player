import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { IndexSync, queryIndex } from "./search-index";

// A Navidrome with two music folders; "2" holds something users without access must never find.
const folders: Record<string, Record<string, Record<string, unknown>[]>> = {
  "1": {
    song: [
      { id: "s1", title: "Creep", artist: "Radiohead", album: "Pablo Honey", playCount: 3 },
      { id: "s2", title: "Creeping Death", artist: "Metallica", album: "Ride the Lightning" },
      { id: "s3", title: "Halo", artist: "Beyoncé", album: "I Am... Sasha Fierce" },
    ],
    album: [{ id: "a1", name: "OK Computer", artist: "Radiohead" }],
    artist: [
      { id: "r1", name: "Radiohead" },
      { id: "r2", name: "AC/DC" },
      { id: "r3", name: "Beyoncé" },
    ],
  },
  "2": { song: [{ id: "x1", title: "Secret Song", artist: "Hidden" }], album: [], artist: [] },
};
let lastScan = "2026-10-01T00:00:00Z";
let calls = 0;
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    const ok = (payload: object) => Response.json({ "subsonic-response": { status: "ok", ...payload } });
    calls += 1;
    if (url.pathname === "/rest/getScanStatus") return ok({ scanStatus: { scanning: false, lastScan } });
    if (url.pathname === "/rest/getMusicFolders")
      return ok({ musicFolders: { musicFolder: Object.keys(folders).map((id) => ({ id: Number(id) })) } });
    const folder = folders[url.searchParams.get("musicFolderId") ?? ""] ?? {};
    const result: Record<string, unknown[]> = {};
    for (const kind of ["song", "album", "artist"]) {
      const count = Number(url.searchParams.get(`${kind}Count`));
      const offset = Number(url.searchParams.get(`${kind}Offset`) ?? 0);
      if (count) result[kind] = (folder[kind] ?? []).slice(offset, offset + count);
    }
    return ok({ searchResult3: result });
  },
});
afterAll(() => server.stop());

const upstream = { id: "default", url: `http://127.0.0.1:${server.port}` };
const account = () => ({ user: "admin", token: "t", salt: "s" });
const ids = (hits: { id: string }[]) => hits.map((hit) => hit.id);

test("finds through accents, typos, missing spaces and punctuation, best match first", async () => {
  const db = new Database(":memory:");
  expect(await new IndexSync(db, upstream, account).rebuild()).toBe(true);
  const search = (text: string, kind: "song" | "album" | "artist") => ids(queryIndex(db, "default", text, kind, 10, null));

  expect(search("beyonce", "artist")).toEqual(["r3"]);
  expect(search("radiohed", "artist")).toEqual(["r1"]);
  expect(search("acdc", "artist")).toEqual(["r2"]);
  expect(search("okcomputer", "album")).toEqual(["a1"]);
  expect(search("ok comp", "album")).toEqual(["a1"]);
  expect(search("creep", "song")).toEqual(["s1", "s2"]);
  expect(search("halo beyonce", "song")).toEqual(["s3"]);
});

test("results stay inside the folders the user may see", async () => {
  const db = new Database(":memory:");
  await new IndexSync(db, upstream, account).rebuild();
  expect(ids(queryIndex(db, "default", "secret", "song", 10, ["1"]))).toEqual([]);
  expect(ids(queryIndex(db, "default", "secret", "song", 10, ["1", "2"]))).toEqual(["x1"]);
  expect(ids(queryIndex(db, "other", "secret", "song", 10, null))).toEqual([]);
});

test("rebuilds only after a new scan or a day, and drops what Navidrome no longer has", async () => {
  let now = 1_000;
  const db = new Database(":memory:");
  const sync = new IndexSync(db, upstream, account, () => now);
  await sync.check();
  expect(sync.status()).toMatchObject({ songs: 4, albums: 1, artists: 3, lastSync: 1_000 });

  calls = 0;
  await sync.check();
  expect(calls).toBe(1);

  const removed = folders["1"]?.song?.pop();
  lastScan = "2026-10-02T00:00:00Z";
  now = 2_000;
  await sync.check();
  expect(sync.status()).toMatchObject({ songs: 3, lastSync: 2_000 });
  expect(ids(queryIndex(db, "default", "halo", "song", 10, null))).toEqual([]);
  if (removed) folders["1"]?.song?.push(removed);
});
