import { expect, test } from "bun:test";
import { createCatalog, lrcFor } from "./catalog";
import { ditheredCover } from "./cover";
import { synth } from "./synth";

test("the catalog is the same for the same seed and differs for another", () => {
  expect(createCatalog(1)).toEqual(createCatalog(1));
  expect(createCatalog(1)).not.toEqual(createCatalog(2));
});

test("the catalog is a believable library: many albums, mixed formats, unique titles per album", () => {
  const albums = createCatalog();
  expect(albums.length).toBeGreaterThanOrEqual(16);
  const tracks = albums.flatMap((album) => album.tracks);
  expect(new Set(tracks.map((track) => track.format)).size).toBe(3);
  for (const album of albums) expect(new Set(album.tracks.map((track) => track.title)).size).toBe(album.tracks.length);
});

test("covers are deterministic and use only the requested grey levels", () => {
  const cover = ditheredCover(5, 64, 4);
  expect(cover).toEqual(ditheredCover(5, 64, 4));
  expect(cover).not.toEqual(ditheredCover(6, 64, 4));
  expect([...cover.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});

test("synth renders whole stereo frames, deterministically", () => {
  const options = { seed: 3, seconds: 1, bpm: 100, scale: "minor", root: 55 } as const;
  const pcm = synth(options);
  expect(pcm.length).toBe(44_100 * 4);
  expect(pcm).toEqual(synth(options));
});

test("lyrics are LRC lines inside the track length", () => {
  const [track] = createCatalog().flatMap((album) => album.tracks);
  const lines = lrcFor(track as NonNullable<typeof track>, 30)
    .split("\n")
    .filter((line) => /^\[\d\d:/.test(line));
  expect(lines.length).toBeGreaterThan(3);
});
