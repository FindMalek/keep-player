import { expect, test } from "bun:test";
import { duplicates, runChecks, splitAlbums, unusualFormats } from "./doctor";

test("duplicates need the same artist and title and a length within 2 seconds", () => {
  const found = duplicates([
    { id: "1", title: "Angel", artist: "Massive Attack", album: "Mezzanine", duration: 379 },
    { id: "2", title: "angel", artist: "Massive Attack", album: "Best of", duration: 380 },
    { id: "3", title: "Angel", artist: "Massive Attack", album: "Live", duration: 420 },
    { id: "4", title: "Teardrop", artist: "Massive Attack", duration: 330 },
  ]);
  expect(found).toHaveLength(1);
  expect(found[0]?.detail).toBe("Mezzanine · Best of");
});

test("an album under two artists with the same first word is split", () => {
  const found = splitAlbums([
    { id: "a", name: "Mezzanine", artist: "Massive Attack", artistId: "1", year: 1998 },
    { id: "b", name: "Mezzanine", artist: "Massive Attack feat. Horace Andy", artistId: "2", year: 1998 },
    { id: "c", name: "Greatest Hits", artist: "Queen", artistId: "3", year: 1981 },
    { id: "d", name: "Greatest Hits", artist: "ABBA", artistId: "4", year: 1981 },
  ]);
  expect(found.map((finding) => finding.label)).toEqual(["Mezzanine"]);
});

test("unusual formats: an odd container, or very low lossy bitrate", () => {
  const found = unusualFormats([
    { id: "1", title: "a", suffix: "mp3", bitRate: 320 },
    { id: "2", title: "b", suffix: "wv" },
    { id: "3", title: "c", suffix: "mp3", bitRate: 64 },
    { id: "4", title: "d", suffix: "flac", bitRate: 90 },
  ]);
  expect(found.map((finding) => finding.songId)).toEqual(["2", "3"]);
});

test("health is the average share of items that pass", () => {
  const report = runChecks(
    [{ id: "1", title: "a", artist: "x", musicBrainzId: "m", replayGain: { trackGain: -3 }, suffix: "flac" }],
    [{ id: "al", name: "A", coverArt: "c" }],
  );
  expect(report.health).toBe(100);
  const bad = runChecks([{ id: "1", title: "a" }], [{ id: "al", name: "A" }]);
  expect(bad.health).toBeLessThan(100);
  expect(bad.checks.find((check) => check.id === "no-cover")?.count).toBe(1);
});
