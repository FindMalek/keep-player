import { describe, expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { recordPlay } from "./history";
import { forgottenFavourites, listeningStats, streaks } from "./stats";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 15, 12);

function song(id: string, artist = "A", album = "X", genre = "Rock") {
  return { id, title: `t${id}`, artist, artistId: `ar-${artist}`, album, albumId: `al-${album}`, genre };
}

describe("listening stats", () => {
  test("tops, minutes, skips, discovery and the clock", () => {
    const db = openLibraryDb(":memory:");
    const play = (id: string, at: number, listened: number, finished = true, artist?: string) =>
      recordPlay(db, "s:u", "", { song: song(id, artist), started: at, listened, finished });
    // Heard before the range: familiar.
    play("1", NOW - 40 * DAY, 200);
    play("1", NOW - 2 * DAY, 200);
    play("1", NOW - DAY, 200);
    play("2", NOW - DAY, 180, true, "B");
    // A skip: minutes count, plays don't.
    play("3", NOW - DAY, 10, false);
    const stats = listeningStats(db, "s:u", NOW - 7 * DAY, NOW, 0, NOW);
    expect(stats.plays).toBe(3);
    expect(stats.skips).toBe(1);
    expect(stats.minutes).toBe(Math.round(590 / 60));
    expect(stats.top.songs[0]).toMatchObject({ id: "1", plays: 2 });
    expect(stats.top.artists.map((artist) => artist.name)).toEqual(["A", "B"]);
    expect(stats.top.genres[0]).toMatchObject({ name: "Rock", plays: 3 });
    expect(stats.discovery).toEqual({ fresh: 1, familiar: 1 });
    // Noon to noon touches 8 calendar days.
    expect(stats.days).toHaveLength(8);
    // Noon UTC, +60 minutes east: 13:00 local.
    const shifted = listeningStats(db, "s:u", NOW - 7 * DAY, NOW, 60, NOW);
    const weekday = new Date(NOW - DAY).getUTCDay();
    expect(shifted.clock[weekday]?.[13]).toBeGreaterThan(0);
    expect(shifted.clock[weekday]?.[12]).toBe(0);
  });

  test("streaks count consecutive days, still going if the last was yesterday", () => {
    expect(streaks([1, 2, 3, 7, 8], 9)).toEqual({ current: 2, longest: 3 });
    expect(streaks([1, 2, 3, 7, 8], 10)).toEqual({ current: 0, longest: 3 });
    expect(streaks([], 10)).toEqual({ current: 0, longest: 0 });
  });

  test("forgotten favourites: played a lot, not lately", () => {
    const db = openLibraryDb(":memory:");
    for (let i = 0; i < 3; i++)
      recordPlay(db, "s:u", "", { song: song("old"), started: NOW - (90 + i) * DAY, listened: 200, finished: true });
    for (let i = 0; i < 3; i++) recordPlay(db, "s:u", "", { song: song("new"), started: NOW - i * DAY, listened: 200, finished: true });
    recordPlay(db, "s:u", "", { song: song("once"), started: NOW - 90 * DAY, listened: 200, finished: true });
    expect(forgottenFavourites(db, "s:u", 30, NOW).map((item) => item.id)).toEqual(["old"]);
  });
});
