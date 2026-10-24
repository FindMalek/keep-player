import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { recordPlay } from "./history";
import { dailyMixes } from "./mixes";
import { createIndexTables } from "./search-index";

const NOW = Date.UTC(2026, 9, 24, 12);
const DAY_MS = 86_400_000;
const song = (id: string, artist: string, title: string) => ({ id, artist, title });

test("plays count by artist and title even when the song's id changed, and artists played together share a mix", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const library = [
    song("a1", "Hurt", "Rapture"),
    song("a2", "Hurt", "Falls Apart"),
    song("b1", "Tool", "Sober"),
    song("c1", "Abba", "SOS"),
  ];
  for (const item of library)
    db.query(
      "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', 'song', ?, '1', 'n', 'n', 0, ?, 1)",
    ).run(item.id, JSON.stringify(item));
  // Played under ids that no longer exist (the files moved since), each Hurt play followed by Tool.
  for (let i = 0; i < 6; i++) {
    const at = NOW - (i + 1) * DAY_MS;
    recordPlay(db, "s:u", "", { song: song(`old-${i}`, "Hurt", "Rapture"), started: at, listened: 200, finished: true });
    recordPlay(db, "s:u", "", { song: song(`old-t${i}`, "Tool", "Sober"), started: at + 600_000, listened: 200, finished: true });
  }

  const mixes = dailyMixes(db, "s", "s:u", 20_000, NOW);
  expect(mixes).toHaveLength(1);
  const mix = mixes[0];
  expect(mix?.description).toBe("Hurt, Tool");
  // Both Hurt songs (one played, one not) and Tool; never Abba, which you don't play.
  expect(mix?.songs.map((item) => item.id).sort()).toEqual(["a1", "a2", "b1"]);
  expect(dailyMixes(db, "s", "s:u", 20_000, NOW)).toEqual(mixes);
});
