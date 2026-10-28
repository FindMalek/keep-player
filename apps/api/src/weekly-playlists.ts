import type { Database } from "bun:sqlite";
import { normalize } from "@lodesong/shared/normalize";
import { keyOf, type Listening, type Mix, seeded, shuffle } from "./mixes";
import { type Groq, topArtistNames, weeklyAnswer } from "./mood-mixes";
import { genresOf, type StatsSong as Song } from "./stats";

// One Groq call a week per account groups the artists you play into named playlists, filled from your own songs.

const ARTISTS_ASKED = 120;
const MAX_PLAYLISTS = 5;
const SIZE = 40;

const SYSTEM = `You group a person's favourite artists into playlists by shared sound, mood and theme, the way a good curator would. Answer with JSON only:
{"playlists": [{"name": short lowercase name (2-4 words, evocative, no emoji), "description": one short lowercase line, "artists": names copied exactly from the list}]}
Make 3 to 5 playlists of 4 to 15 artists each. An artist can be in two playlists. Don't name playlists after a single artist.`;

type Answer = { playlists?: { name?: unknown; description?: unknown; artists?: unknown }[] };

function diverse(l: Listening, artists: string[], size: number, random: () => number): Song[] {
  const cap = Math.ceil(size / artists.length) + 1;
  const picked = artists.flatMap((artist) => {
    const songs = shuffle(l.byArtist.get(artist) ?? [], random);
    const played = songs.filter((song) => l.playedKeys.has(keyOf(song)));
    const fresh = songs.filter((song) => !l.playedKeys.has(keyOf(song)));
    return [...played.slice(0, Math.ceil(cap / 2)), ...fresh].slice(0, cap);
  });
  return shuffle(picked, random).slice(0, size);
}

function catalogLine(l: Listening, name: string): string {
  const songs = l.byArtist.get(normalize(name)) ?? [];
  const genres = [...new Set(songs.flatMap(genresOf).map((genre) => genre.toLowerCase()))].slice(0, 3);
  const years = songs.map((song) => Number(song.year)).filter((year) => year > 0);
  return [name, genres.join("/"), years.length ? `${Math.min(...years)}–${Math.max(...years)}` : ""].filter(Boolean).join(" · ");
}

export async function weeklyPlaylists(
  db: Database,
  groq: Groq | null,
  account: string,
  day: number,
  l: Listening | null,
  fetcher: typeof fetch = fetch,
): Promise<Mix[]> {
  if (!groq || !l) return [];
  const names = topArtistNames(l, ARTISTS_ASKED);
  if (names.length < 8) return [];
  const week = Math.floor(day / 7);
  const answer = await weeklyAnswer<Answer>(
    db,
    groq,
    "weekly",
    account,
    week,
    { system: SYSTEM, user: names.map((name) => catalogLine(l, name)).join("\n") },
    fetcher,
  );
  return (answer?.playlists ?? []).slice(0, MAX_PLAYLISTS).flatMap((playlist, index) => {
    if (typeof playlist.name !== "string" || !Array.isArray(playlist.artists)) return [];
    const artists = [...new Set(playlist.artists.filter((name): name is string => typeof name === "string").map(normalize))].filter(
      (artist) => l.byArtist.has(artist),
    );
    if (artists.length < 2) return [];
    const songs = diverse(l, artists, SIZE, seeded(`${account}:${week}:weekly:${index}`));
    const name = playlist.name.toLowerCase().slice(0, 40);
    // "· weekly" keeps them apart from your own playlists: saving one replaces a playlist with the same name.
    return songs.length
      ? [
          {
            id: `weekly-${index}`,
            name: `${name} · weekly`,
            description: typeof playlist.description === "string" ? playlist.description.slice(0, 120) : "",
            songs,
          },
        ]
      : [];
  });
}
