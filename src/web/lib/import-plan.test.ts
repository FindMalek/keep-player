import { describe, expect, test } from "bun:test";
import type { Candidate } from "../../shared/import-match";
import type { ImportSet } from "../../shared/spotify-import";
import { buildPlan, counts, type ImportRow, missingTracks, pick, rowBucket, toRow, trackKey } from "./import-plan";

const song = (id: string, confidence: number): Candidate => ({ id, title: id, artist: "A", confidence });
const track = (title: string) => ({ title, artist: "A" });

const set: ImportSet = {
  playlists: [
    { name: "Night", tracks: [track("one"), track("two"), track("three"), track("one")] },
    { name: "Day", tracks: [track("two")] },
  ],
  liked: [track("one"), track("four")],
};

function rows(): Map<string, ImportRow> {
  return new Map([
    [trackKey(track("one")), toRow(track("one"), { best: song("s1", 0.97), alternatives: [] })],
    [trackKey(track("two")), toRow(track("two"), { best: song("s2", 0.7), alternatives: [song("s9", 0.6)] })],
    [trackKey(track("three")), toRow(track("three"), { best: null, alternatives: [] })],
    [trackKey(track("four")), toRow(track("four"), { best: song("s4", 0.9), alternatives: [] })],
  ]);
}

describe("rows", () => {
  test("buckets by confidence, and a hand-picked song is sure", () => {
    const map = rows();
    expect(rowBucket(map.get(trackKey(track("one"))) as ImportRow)).toBe("matched");
    expect(rowBucket(map.get(trackKey(track("two"))) as ImportRow)).toBe("review");
    expect(rowBucket(map.get(trackKey(track("three"))) as ImportRow)).toBe("missing");
    const picked = pick(map.get(trackKey(track("three"))) as ImportRow, song("s7", 0.1));
    expect(rowBucket(picked)).toBe("matched");
    expect(picked.choice?.id).toBe("s7");
  });
  test("counts, with skipped apart", () => {
    const map = rows();
    const two = map.get(trackKey(track("two"))) as ImportRow;
    map.set(trackKey(track("two")), { ...two, skipped: true });
    expect(counts(map.values())).toEqual({ matched: 2, review: 0, missing: 1, skipped: 1 });
  });
});

describe("buildPlan", () => {
  test("keeps playlist order, once each, leaves out missing and skipped, and prefixes the folder", () => {
    const map = rows();
    const plan = buildPlan(set, map, "Spotify");
    expect(plan.playlists).toEqual([
      { name: "Spotify / Night", songIds: ["s1", "s2"], wanted: 4 },
      { name: "Spotify / Day", songIds: ["s2"], wanted: 1 },
    ]);
    expect(plan.liked).toEqual(["s1", "s4"]);
    const two = map.get(trackKey(track("two"))) as ImportRow;
    map.set(trackKey(track("two")), { ...two, skipped: true });
    expect(buildPlan(set, map, "").playlists[0]?.songIds).toEqual(["s1"]);
  });
  test("missingTracks lists what nothing matched or was skipped", () => {
    const map = rows();
    expect(missingTracks(map.values()).map((entry) => entry.title)).toEqual(["three"]);
  });
});
