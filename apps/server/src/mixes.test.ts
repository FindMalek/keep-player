import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { recordPlay } from "./history";
import { dailyMixes } from "./mixes";
import { createIndexTables } from "./search-index";

const NOW = Date.UTC(2026, 9, 24, 12);
const song = (id: string, genre: string, artist: string) => ({ id, title: `t${id}`, artist, genre });

test("a mix per genre you play, mixing songs you play with ones from the same genre you never played", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const library = [
    song("r1", "Rock", "A"),
    song("r2", "Rock", "A"),
    song("r3", "Rock", "B"),
    song("j1", "Jazz", "C"),
    song("j2", "Jazz", "C"),
  ];
  for (const item of library)
    db.query(
      "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', 'song', ?, '1', 'n', 'n', 0, ?, 1)",
    ).run(item.id, JSON.stringify(item));
  for (let i = 0; i < 7; i++)
    recordPlay(db, "s:u", "", { song: library[0] as never, started: NOW - i * 3_600_000, listened: 200, finished: true });
  for (let i = 0; i < 6; i++)
    recordPlay(db, "s:u", "", { song: library[3] as never, started: NOW - i * 3_600_000, listened: 200, finished: true });

  const mixes = dailyMixes(db, "s", "s:u", 20_000, NOW);
  expect(mixes.map((mix) => mix.description.split(" · ")[0])).toEqual(["rock", "jazz"]);
  const rock = mixes[0]?.songs.map((item) => item.id).sort();
  // r1 you play; r2 and r3 are rock you never played. Nothing from jazz.
  expect(rock).toEqual(["r1", "r2", "r3"]);
  // Same day, same mix: every device agrees.
  expect(dailyMixes(db, "s", "s:u", 20_000, NOW)).toEqual(mixes);
});
