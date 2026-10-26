import { expect, test } from "bun:test";
import { askGroq, buildPlaylist, parsePlan } from "./ai-playlist";
import type { StatsSong } from "./stats";

const song = (id: string, artist: string, year: number): StatsSong => ({ id, title: `${artist} ${id}`, artist, year });
const artists = new Map([
  [
    "portishead",
    {
      name: "Portishead",
      plays: 9,
      songs: [song("p1", "Portishead", 1994), song("p2", "Portishead", 2008), song("p3", "Portishead", 1997)],
    },
  ],
  ["massive attack", { name: "Massive Attack", plays: 0, songs: [song("m1", "Massive Attack", 1998), song("m2", "Massive Attack", 1991)] }],
  ["abba", { name: "ABBA", plays: 1, songs: [song("a1", "ABBA", 1976)] }],
]);

test("a plan keeps only artists in the library, matched loosely, with a sane era and size", () => {
  const plan = parsePlan(
    'sure: {"name": "Rainy Sunday", "artists": ["portishead", "Made Up Band", "Massive Attack"], "years": [2000, 1990], "size": 500}',
    artists,
  );
  expect(plan).toEqual({ name: "rainy sunday", description: "", artists: ["Portishead", "Massive Attack"], years: [1990, 2000], size: 60 });
  expect(parsePlan('{"name": "x", "artists": ["Nobody"]}', artists)).toBeNull();
  expect(parsePlan("no json here", artists)).toBeNull();
});

test("the playlist is only owned songs by those artists, in the era asked", () => {
  const songs = buildPlaylist(
    { name: "x", description: "", artists: ["Portishead", "Massive Attack"], years: [1990, 2000] },
    artists,
    new Set(),
    "seed",
  );
  expect(songs.map((item) => item.id).sort()).toEqual(["m1", "m2", "p1", "p3"]);
});

test("a failed or empty answer from groq is no plan", async () => {
  const down = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
  expect(await askGroq({ key: "k", model: "m", url: "http://groq" }, "rainy", artists, down)).toBeNull();
  const empty = (async () => Response.json({ choices: [{ message: { content: "{}" } }] })) as unknown as typeof fetch;
  expect(await askGroq({ key: "k", model: "m", url: "http://groq" }, "rainy", artists, empty)).toBeNull();
});
