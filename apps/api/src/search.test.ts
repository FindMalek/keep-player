import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { search } from "./search";
import { IndexSync } from "./search-index";

const library: Record<string, Record<string, unknown>[]> = {
  song: [
    {
      id: "s1",
      title: "Creep",
      artist: "Radiohead",
      album: "Pablo Honey",
      year: 1993,
      genre: "Rock",
      suffix: "flac",
      playCount: 1,
      starred: "x",
    },
    { id: "s2", title: "Creep", artist: "TLC", album: "CrazySexyCool", year: 1994, genre: "R&B", suffix: "mp3", playCount: 9 },
    { id: "s3", title: "Karma Police", artist: "Radiohead", album: "OK Computer", year: 1997, genre: "Rock", suffix: "flac" },
    { id: "s4", title: "Radiohead", artist: "Someone Else", album: "Tribute", year: 2010, genre: "Pop", suffix: "mp3" },
  ],
  album: [{ id: "a1", name: "OK Computer", artist: "Radiohead", year: 1997, genre: "Rock" }],
  artist: [
    { id: "r1", name: "Radiohead" },
    { id: "r2", name: "TLC" },
  ],
};
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    const ok = (payload: object) => Response.json({ "subsonic-response": { status: "ok", ...payload } });
    if (url.pathname === "/rest/getMusicFolders") return ok({ musicFolders: { musicFolder: [{ id: 1 }] } });
    const result: Record<string, unknown[]> = {};
    for (const kind of ["song", "album", "artist"]) {
      const offset = Number(url.searchParams.get(`${kind}Offset`) ?? 0);
      if (Number(url.searchParams.get(`${kind}Count`))) result[kind] = (library[kind] ?? []).slice(offset);
    }
    return ok({ searchResult3: result });
  },
});
const db = new Database(":memory:");
beforeAll(() =>
  new IndexSync(db, { id: "d", url: `http://127.0.0.1:${server.port}` }, () => ({ user: "a", token: "t", salt: "s" })).rebuild(),
);
afterAll(() => server.stop());

const ids = (items: Record<string, unknown>[]) => items.map((item) => item.id);
const nobody = { folders: null, liked: new Set<string>() };

test("artist - title and title by artist pick that song first, and a name you typed exactly is the top result", () => {
  expect(search(db, "d", "radiohead - creep", nobody).top).toEqual({ kind: "song", item: expect.objectContaining({ id: "s1" }) });
  expect(ids(search(db, "d", "creep by tlc", nobody).songs)[0]).toBe("s2");
  expect(search(db, "d", "radiohead", nobody).top).toMatchObject({ kind: "artist", item: { id: "r1" } });
  // Plays break the tie between two exact titles.
  expect(ids(search(db, "d", "creep", nobody).songs)).toEqual(["s2", "s1"]);
});

test("operators filter every group, alone or with text", () => {
  const rock90s = search(db, "d", "genre:rock year:1990..1999", nobody);
  expect(ids(rock90s.songs)).toEqual(["s1", "s3"]);
  expect(ids(rock90s.albums)).toEqual(["a1"]);
  expect(rock90s.artists).toEqual([]);
  expect(rock90s.top).toBeNull();
  const flac = search(db, "d", "creep format:flac", nobody);
  expect([ids(flac.songs), flac.albums]).toEqual([["s1"], []]);
  expect(flac.chips).toEqual([{ key: "format", value: "flac", raw: "format:flac" }]);
});

test("your likes, not the indexing account's: they rank first and is:liked keeps only them", () => {
  const you = { folders: null, liked: new Set(["s1"]) };
  const creep = search(db, "d", "creep", you).songs;
  expect(ids(creep)).toEqual(["s1", "s2"]);
  expect(creep[0]?.starred).toBe(true);
  expect(search(db, "d", "creep", nobody).songs.find((song) => song.id === "s1")?.starred).toBeUndefined();
  expect(ids(search(db, "d", "is:liked", you).songs)).toEqual(["s1"]);
});

test("bpm:, energy: and mood: need analysed songs and only ever match songs", () => {
  const features = new Map([
    ["s1", { bpm: 124, key: "A minor", energy: 0.9, valence: 0.8, danceability: 0.7 }],
    ["s3", { bpm: 80, key: "C major", energy: 0.2, valence: 0.7, danceability: 0.4 }],
  ]);
  const context = { ...nobody, features };
  expect(ids(search(db, "d", "bpm:120..130", context).songs)).toEqual(["s1"]);
  expect(ids(search(db, "d", "energy:low mood:chill", context).songs)).toEqual(["s3"]);
  expect(ids(search(db, "d", "radiohead mood:upbeat", context).songs)).toEqual(["s1"]);
  expect(search(db, "d", "bpm:120..130", context).albums).toEqual([]);
  expect(search(db, "d", "bpm:120..130", nobody).songs).toEqual([]);
});
