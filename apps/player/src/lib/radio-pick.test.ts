import { expect, test } from "bun:test";
import { pick, type Station } from "./radio-pick";
import type { Song } from "./types";

const song = (id: string, artist: string, extra: Partial<Song> = {}): Song => ({ id, title: id, artist, artistId: artist, ...extra });
const station = (patch: Partial<Station> = {}): Station => ({
  name: "test radio",
  anchors: [],
  liked: new Set(),
  disliked: new Set(),
  artistStrikes: new Map(),
  played: new Set(),
  variety: 0.5,
  eraLock: null,
  artistLock: null,
  ...patch,
});
const ids = (songs: Song[]) => songs.map((item) => item.id);
const none = () => 0;

test("leaves out bans, dislikes, songs already played and artists with two strikes", () => {
  const found = [song("a", "x"), song("b", "x"), song("c", "y"), song("d", "z"), song("e", "w")].map((item) => ({ song: item, weight: 1 }));
  const picked = pick(
    station({ disliked: new Set(["b"]), played: new Set(["c"]), artistStrikes: new Map([["z", 2]]) }),
    found,
    10,
    new Set(["e"]),
    none,
  );
  expect(ids(picked)).toEqual(["a"]);
});

test("similar songs outrank the genre neighbourhood, and no artist takes more than two of a batch", () => {
  const found = [
    { song: song("n1", "q"), weight: 1 },
    { song: song("s1", "x"), weight: 3 },
    { song: song("s2", "x"), weight: 3 },
    { song: song("s3", "x"), weight: 3 },
  ];
  expect(ids(pick(station(), found, 3, new Set(), none))).toEqual(["s1", "s2", "n1"]);
});

test("variety: familiar prefers songs you play, discover prefers ones you never did", () => {
  const found = [
    { song: song("old", "a", { playCount: 50 }), weight: 1 },
    { song: song("new", "b", { playCount: 0 }), weight: 1 },
  ];
  expect(ids(pick(station({ variety: 0 }), found, 1, new Set(), none))).toEqual(["old"]);
  expect(ids(pick(station({ variety: 1 }), found, 1, new Set(), none))).toEqual(["new"]);
});

test("era and artist locks", () => {
  const found = [song("60s", "a", { year: 1965 }), song("90s", "b", { year: 1994 }), song("a90", "a", { year: 1996 })].map((item) => ({
    song: item,
    weight: 1,
  }));
  expect(ids(pick(station({ eraLock: [1990, 2000] }), found, 5, new Set(), none))).toEqual(["90s", "a90"]);
  expect(ids(pick(station({ artistLock: { id: "a", name: "a" } }), found, 5, new Set(), none))).toEqual(["60s", "a90"]);
});
