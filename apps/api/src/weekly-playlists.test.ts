import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { recordPlay } from "./history";
import { listening } from "./mixes";
import { createIndexTables } from "./search-index";
import { weeklyPlaylists } from "./weekly-playlists";

const NOW = Date.UTC(2026, 9, 24, 12);

test("weekly playlists come from one cached groq call, keep to your artists, and no artist takes over", async () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const artists = ["Hurt", "Tool", "Abba", "Mitski", "Bjork", "Low", "Air", "Can"];
  for (const artist of artists)
    for (let i = 0; i < (artist === "Hurt" ? 60 : 3); i++) {
      const song = { id: `${artist}-${i}`, artist, title: `${artist} ${i}` };
      db.query(
        "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', 'song', ?, '1', 'n', 'n', 0, ?, 1)",
      ).run(song.id, JSON.stringify(song));
      if (i === 0) recordPlay(db, "s:u", "", { song, started: NOW - 86_400_000, listened: 200, finished: true });
    }
  let calls = 0;
  const groq = (async () => {
    calls++;
    const playlists = [{ name: "Grey Mornings", description: "soft", artists: ["Hurt", "Low", "Air", "Nobody Real"] }];
    return Response.json({ choices: [{ message: { content: JSON.stringify({ playlists }) } }] });
  }) as unknown as typeof fetch;
  const settings = { key: "k", model: "m", url: "http://groq" };
  const l = listening(db, "s", "s:u", NOW);

  const [mix] = await weeklyPlaylists(db, settings, "s:u", 20_385, l, groq);
  expect(mix?.name).toBe("grey mornings · weekly");
  const byArtist = Map.groupBy(mix?.songs ?? [], (song) => song.artist);
  expect([...byArtist.keys()].sort()).toEqual(["Air", "Hurt", "Low"]);
  // 40 songs over 3 artists: Hurt's 60 songs are capped at ceil(40 / 3) + 1.
  expect(byArtist.get("Hurt")?.length).toBeLessThanOrEqual(15);

  await weeklyPlaylists(db, settings, "s:u", 20_386, l, groq);
  expect(calls).toBe(1);
});
