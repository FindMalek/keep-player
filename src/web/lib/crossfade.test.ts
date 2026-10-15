import { describe, expect, test } from "bun:test";
import { continuesAlbum, equalPower, fadeBetween, fitFade } from "./crossfade";
import type { Song } from "./types";

const song = (id: string, extra: Partial<Song> = {}): Song => ({ id, title: id, ...extra });

describe("continuesAlbum", () => {
  test("the next track of the same album does", () => {
    expect(continuesAlbum(song("a", { albumId: "x", track: 3 }), song("b", { albumId: "x", track: 4 }))).toBe(true);
  });
  test("a skipped track, another album, or no track numbers do not", () => {
    expect(continuesAlbum(song("a", { albumId: "x", track: 3 }), song("b", { albumId: "x", track: 5 }))).toBe(false);
    expect(continuesAlbum(song("a", { albumId: "x", track: 3 }), song("b", { albumId: "y", track: 4 }))).toBe(false);
    expect(continuesAlbum(song("a", { albumId: "x" }), song("b", { albumId: "x" }))).toBe(false);
    expect(continuesAlbum(undefined, song("b"))).toBe(false);
  });
  test("the first track of the next disc does", () => {
    const a = song("a", { albumId: "x", track: 12, discNumber: 1 });
    expect(continuesAlbum(a, song("b", { albumId: "x", track: 1, discNumber: 2 }))).toBe(true);
    expect(continuesAlbum(a, song("c", { albumId: "x", track: 2, discNumber: 2 }))).toBe(false);
  });
});

describe("fadeBetween", () => {
  const a = song("a", { albumId: "x", track: 1 });
  test("is 0 when off, for the same song, and inside an album", () => {
    expect(fadeBetween(0, a, song("b"))).toBe(0);
    expect(fadeBetween(6, a, a)).toBe(0);
    expect(fadeBetween(6, a, song("b", { albumId: "x", track: 2 }))).toBe(0);
  });
  test("is the setting between unrelated songs, capped at 12", () => {
    expect(fadeBetween(6, a, song("c", { albumId: "y", track: 1 }))).toBe(6);
    expect(fadeBetween(30, a, song("c"))).toBe(12);
  });
});

describe("fitFade", () => {
  test("shrinks to half of the shorter song", () => {
    expect(fitFade(8, 100, 100)).toBe(8);
    expect(fitFade(8, 10, 100)).toBe(5);
    expect(fitFade(8, Number.NaN, 100)).toBe(8);
  });
});

describe("equalPower", () => {
  test("goes 0 to 1 and 1 to 0 with constant total power", () => {
    const { incoming, outgoing } = equalPower(1, 1);
    expect(incoming[0]).toBeCloseTo(0);
    expect(incoming.at(-1)).toBeCloseTo(1);
    expect(outgoing[0]).toBeCloseTo(1);
    expect(outgoing.at(-1)).toBeCloseTo(0, 5);
    for (let i = 0; i < incoming.length; i += 1) expect((incoming[i] as number) ** 2 + (outgoing[i] as number) ** 2).toBeCloseTo(1, 4);
  });
  test("scales each side by its ReplayGain factor", () => {
    const { incoming, outgoing } = equalPower(0.5, 2);
    expect(incoming.at(-1)).toBeCloseTo(0.5);
    expect(outgoing[0]).toBeCloseTo(2);
  });
});
