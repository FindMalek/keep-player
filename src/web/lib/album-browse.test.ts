import { describe, expect, test } from "bun:test";
import { discStarts, groupByRelease, matches, NO_FILTER, releaseKind, sortAlbums } from "./album-browse";
import type { Album } from "./types";

const album = (id: string, extra: Partial<Album> = {}): Album => ({ id, name: id, ...extra });

describe("sortAlbums", () => {
  const albums = [album("b", { year: 2001, playCount: 1, artist: "Z" }), album("a", { year: 1999, playCount: 9, artist: "Y" })];
  test("sorts by name, year, plays and artist", () => {
    expect(sortAlbums(albums, "name").map((a) => a.id)).toEqual(["a", "b"]);
    expect(sortAlbums(albums, "year").map((a) => a.id)).toEqual(["b", "a"]);
    expect(sortAlbums(albums, "plays").map((a) => a.id)).toEqual(["a", "b"]);
    expect(sortAlbums(albums, "artist").map((a) => a.id)).toEqual(["a", "b"]);
  });
  test("random is deterministic for a given source and leaves the input alone", () => {
    const keys = [0.9, 0.1];
    let i = 0;
    expect(sortAlbums(albums, "random", () => keys[i++ % 2] as number).map((a) => a.id)).toEqual(["a", "b"]);
    expect(albums.map((a) => a.id)).toEqual(["b", "a"]);
  });
});

describe("matches", () => {
  test("combines genre, years, unplayed and liked", () => {
    const a = album("x", { genre: "Jazz", year: 1970, playCount: 0 });
    expect(matches(a, NO_FILTER)).toBe(true);
    expect(matches(a, { ...NO_FILTER, genre: "jazz" })).toBe(true);
    expect(matches(a, { ...NO_FILTER, genre: "rock" })).toBe(false);
    expect(matches(a, { ...NO_FILTER, fromYear: 1980 })).toBe(false);
    expect(matches(a, { ...NO_FILTER, toYear: 1975 })).toBe(true);
    expect(matches(a, { ...NO_FILTER, unplayed: true })).toBe(true);
    expect(matches({ ...a, playCount: 3 }, { ...NO_FILTER, unplayed: true })).toBe(false);
    expect(matches(a, { ...NO_FILTER, liked: true })).toBe(false);
  });
  test("an album without a year fails a year range", () => {
    expect(matches(album("n"), { ...NO_FILTER, toYear: 2000 })).toBe(false);
  });
});

describe("release types", () => {
  test("classifies, with compilations and unknowns handled", () => {
    expect(releaseKind(album("a"))).toBe("album");
    expect(releaseKind(album("a", { releaseTypes: ["ep"] }))).toBe("ep");
    expect(releaseKind(album("a", { releaseTypes: ["album", "live"] }))).toBe("live");
    expect(releaseKind(album("a", { isCompilation: true }))).toBe("compilation");
    expect(releaseKind(album("a", { releaseTypes: ["soundtrack"] }))).toBe("other");
  });
  test("groups in a fixed order, newest first, without empty groups", () => {
    const groups = groupByRelease([
      album("s", { releaseTypes: ["single"], year: 2020 }),
      album("a1", { year: 2010 }),
      album("a2", { year: 2015 }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["albums", "singles"]);
    expect(groups[0]?.albums.map((a) => a.id)).toEqual(["a2", "a1"]);
  });
});

describe("discStarts", () => {
  test("is empty for one disc and lists first tracks for more", () => {
    expect(discStarts([{ discNumber: 1 }, { discNumber: 1 }])).toEqual([]);
    expect(discStarts([{}, {}, { discNumber: 2 }, { discNumber: 2 }])).toEqual([
      { disc: 1, index: 0 },
      { disc: 2, index: 2 },
    ]);
  });
});

describe("genre page helpers", () => {
  test("topArtists ranks by album count, then name, and skips albums without an artist", async () => {
    const { topArtists } = await import("./album-browse");
    const albums = [
      album("1", { artistId: "b", artist: "B" }),
      album("2", { artistId: "a", artist: "A" }),
      album("3", { artistId: "b", artist: "B" }),
      album("4"),
      album("5", { artistId: "c", artist: "C" }),
    ];
    expect(topArtists(albums).map((artist) => [artist.id, artist.albums])).toEqual([
      ["b", 2],
      ["a", 1],
      ["c", 1],
    ]);
    expect(topArtists(albums, 1)).toHaveLength(1);
  });
  test("topSongs ranks by plays and keeps order for ties", async () => {
    const { topSongs } = await import("./album-browse");
    const songs = [{ id: "a", playCount: 1 }, { id: "b", playCount: 5 }, { id: "c" }, { id: "d" }];
    expect(topSongs(songs).map((song) => song.id)).toEqual(["b", "a", "c", "d"]);
    expect(topSongs(songs, 2)).toHaveLength(2);
  });
});
