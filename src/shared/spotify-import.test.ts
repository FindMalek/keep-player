import { describe, expect, test } from "bun:test";
import { dedupe, missingCsv, parseExport, readTrack } from "./spotify-import";

describe("readTrack", () => {
  test("reads Spotify's export, the library file and the web API shape", () => {
    expect(readTrack({ trackName: "Angel", artistName: "Massive Attack", albumName: "Mezzanine" })).toEqual({
      title: "Angel",
      artist: "Massive Attack",
      album: "Mezzanine",
    });
    expect(readTrack({ track: "Angel", artist: "Massive Attack", album: "Mezzanine" })?.title).toBe("Angel");
    expect(
      readTrack({ name: "Angel", artists: [{ name: "Massive Attack" }], duration_ms: 379000, external_ids: { isrc: "GBAAA9800001" } }),
    ).toEqual({ title: "Angel", artist: "Massive Attack", durationMs: 379000, isrc: "GBAAA9800001" });
  });
  test("skips anything without a title and an artist (podcasts, local files)", () => {
    expect(readTrack({ episode: { name: "A podcast" } })).toBeNull();
    expect(readTrack({ trackName: "x" })).toBeNull();
    expect(readTrack(null)).toBeNull();
  });
});

describe("parseExport", () => {
  test("merges playlist files and the library file", () => {
    const set = parseExport([
      {
        playlists: [
          { name: "Night Drive", items: [{ track: { trackName: "A", artistName: "X" } }, { episode: {} }] },
          { name: "Empty", items: [] },
        ],
      },
      { tracks: [{ artist: "Y", album: "Z", track: "B" }] },
      "not an object",
    ]);
    expect(set.playlists).toEqual([{ name: "Night Drive", tracks: [{ title: "A", artist: "X" }] }]);
    expect(set.liked).toEqual([{ title: "B", artist: "Y", album: "Z" }]);
  });
  test("reads our own shape", () => {
    const set = parseExport([{ playlists: [{ name: "P", tracks: [{ title: "T", artist: "A" }] }], liked: [{ title: "L", artist: "A" }] }]);
    expect(set.playlists[0]?.tracks).toHaveLength(1);
    expect(set.liked).toHaveLength(1);
  });
});

describe("dedupe and csv", () => {
  test("a repeated song once, case-insensitively", () => {
    expect(
      dedupe([
        { title: "A", artist: "X" },
        { title: "a", artist: "x" },
        { title: "B", artist: "X" },
      ]),
    ).toHaveLength(2);
  });
  test("missing list as CSV with quoting", () => {
    expect(missingCsv([{ title: 'Hey, "You"', artist: "Pink Floyd", album: "The Wall" }])).toBe(
      'artist,title,album,isrc\nPink Floyd,"Hey, ""You""",The Wall,\n',
    );
  });
  test("formula-looking cells are defused and CRs quoted", () => {
    expect(missingCsv([{ title: "=SUM(A1)", artist: "@x", album: "a\rb" }])).toBe("artist,title,album,isrc\n'@x,'=SUM(A1),\"a\rb\",\n");
  });
});
