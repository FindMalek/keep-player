import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { recordPlay } from "./history";
import { dailyMixes, mixesVersion } from "./mixes";
import { changeSong } from "./prefs";
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
  expect(mix?.songs.map((item) => item.id).sort()).toEqual(["a1", "a2", "b1"]);
  expect(dailyMixes(db, "s", "s:u", 20_000, NOW)).toEqual(mixes);
});

test("discover weekly is only songs you never played; the daylist follows what you play at that hour", async () => {
  const { madeForYou } = await import("./mixes");
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const library = [
    song("a1", "Hurt", "Rapture"),
    song("a2", "Hurt", "Falls Apart"),
    song("n1", "Abba", "SOS"),
    song("m1", "Mitski", "Nobody"),
  ];
  for (const item of library)
    db.query(
      "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', 'song', ?, '1', 'n', 'n', 0, ?, 1)",
    ).run(item.id, JSON.stringify(item));
  // Hurt every morning (08:00 UTC), Mitski every night (23:00 UTC).
  const midnight = Date.UTC(2026, 9, 24);
  for (let i = 1; i <= 6; i++) {
    recordPlay(db, "s:u", "", {
      song: song("x", "Hurt", "Rapture"),
      started: midnight - i * DAY_MS + 8 * 3_600_000,
      listened: 200,
      finished: true,
    });
    recordPlay(db, "s:u", "", {
      song: song("y", "Mitski", "Nobody"),
      started: midnight - i * DAY_MS + 23 * 3_600_000,
      listened: 200,
      finished: true,
    });
  }
  const at = (hour: number) => madeForYou(db, "s", "s:u", { day: 20_385, hour, tzMinutes: 0 }, NOW);
  const discover = at(9).find((mix) => mix.id === "discover-weekly");
  expect(discover?.songs.map((item) => item.id).sort()).toEqual(["a2", "n1"]);
  expect(at(9).find((mix) => mix.id === "daylist")?.description).toContain("morning: Hurt");
  expect(at(23).find((mix) => mix.id === "daylist")?.description).toContain("night: Mitski");
});

test("release radar is new songs by artists you play; on this day is what you played a year ago", async () => {
  const { madeForYou, listening } = await import("./mixes");
  const { moodMixes } = await import("./mood-mixes");
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const fresh = new Date(NOW - 5 * DAY_MS).toISOString();
  const old = new Date(NOW - 200 * DAY_MS).toISOString();
  const library = [
    { ...song("h1", "Hurt", "Rapture"), created: old },
    { ...song("h2", "Hurt", "New One"), created: fresh },
    { ...song("z1", "Zola", "Brand New"), created: fresh },
  ];
  for (const item of library)
    db.query(
      "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', 'song', ?, '1', 'n', 'n', 0, ?, 1)",
    ).run(item.id, JSON.stringify(item));
  recordPlay(db, "s:u", "", { song: song("x", "Hurt", "Rapture"), started: NOW - DAY_MS, listened: 200, finished: true });
  recordPlay(db, "s:u", "", { song: song("y", "Hurt", "Rapture"), started: NOW - 366 * DAY_MS, listened: 200, finished: true });

  const mixes = madeForYou(db, "s", "s:u", { day: 20_385, hour: 12, tzMinutes: 0 }, NOW);
  // Zola is new too, but you don't play Zola.
  expect(mixes.find((mix) => mix.id === "release-radar")?.songs.map((item) => item.id)).toEqual(["h2"]);
  expect(mixes.find((mix) => mix.id === "on-this-day")?.songs.map((item) => item.id)).toEqual(["h1"]);

  let calls = 0;
  const groq = (async () => {
    calls++;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ focus: ["Hurt", "Not Mine"] }) } }] });
  }) as unknown as typeof fetch;
  const settings = { key: "k", model: "m", url: "http://groq" };
  for (const [id, artist] of [
    ["a1", "Abba"],
    ["t1", "Tool"],
  ] as const) {
    db.query(
      "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', 'song', ?, '1', 'n', 'n', 0, ?, 1)",
    ).run(id, JSON.stringify({ ...song(id, artist, "x"), created: old }));
    recordPlay(db, "s:u", "", { song: song(id, artist, "x"), started: NOW - 2 * DAY_MS, listened: 200, finished: true });
  }
  const l = listening(db, "s", "s:u", NOW);
  const first = await moodMixes(db, settings, "s:u", 20_385, l, groq);
  expect(first.map((mix) => mix.name)).toEqual(["focus mix"]);
  expect(first[0]?.songs.every((item) => item.artist === "Hurt")).toBe(true);
  await moodMixes(db, settings, "s:u", 20_386, l, groq);
  expect(calls).toBe(1);
});

test("the cache key for made for you changes with a play or a never pref, and only then", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const version = () => mixesVersion(db, "s", "s:u");
  const before = version();
  expect(version()).toBe(before);
  recordPlay(db, "s:u", "", { song: song("a1", "Hurt", "Rapture"), started: NOW, listened: 200, finished: true });
  const played = version();
  expect(played).not.toBe(before);
  recordPlay(db, "s:other", "", { song: song("a1", "Hurt", "Rapture"), started: NOW, listened: 200, finished: true });
  expect(version()).toBe(played);
  changeSong(db, "s:u", "a1", { never: true });
  expect(version()).not.toBe(played);
});
