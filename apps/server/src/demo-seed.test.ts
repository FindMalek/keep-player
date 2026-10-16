import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { generatePlays, seedHistory } from "./demo-seed";
import { createHistoryTables, readPlays } from "./history";

const songs = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, title: `Song ${i}`, duration: 180 + i }));
const NOW = Date.UTC(2026, 9, 16, 12);

test("the same seed gives the same history, a different one doesn't", () => {
  expect(generatePlays(songs, NOW)).toEqual(generatePlays(songs, NOW));
  expect(generatePlays(songs, NOW, 180, 8)).not.toEqual(generatePlays(songs, NOW));
});

test("the history reads like a person: months of it, favourites on top, some skips, nothing in the future", () => {
  const plays = generatePlays(songs, NOW);
  expect(plays.length).toBeGreaterThan(1500);
  expect(Math.min(...plays.map((play) => play.started))).toBeLessThan(NOW - 150 * 86_400_000);
  expect(plays.every((play) => play.started <= NOW)).toBe(true);
  const counts = new Map<string, number>();
  for (const play of plays) counts.set(play.song.id, (counts.get(play.song.id) ?? 0) + 1);
  const sorted = [...counts.values()].sort((a, b) => b - a);
  expect(sorted[0]).toBeGreaterThan((sorted.at(-1) ?? 0) * 4);
  const skips = plays.filter((play) => !play.finished && play.listened < 30).length;
  expect(skips / plays.length).toBeGreaterThan(0.03);
  expect(skips / plays.length).toBeLessThan(0.25);
});

test("seeding fills an empty account once and leaves a used one alone", () => {
  const db = new Database(":memory:", { strict: true });
  createHistoryTables(db);
  const written = seedHistory(db, "default:demo", songs, NOW);
  expect(written).toBeGreaterThan(1500);
  expect(readPlays(db, "default:demo", NOW + 1, 5)).toHaveLength(5);
  expect(seedHistory(db, "default:demo", songs, NOW)).toBe(0);
  expect(readPlays(db, "default:other", NOW + 1, 5)).toHaveLength(0);
});
