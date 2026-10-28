import type { Database } from "bun:sqlite";
import { normalize } from "@lodesong/shared/normalize";
import { keyOf, seeded, shuffle } from "./mixes";
import { readPrefs } from "./prefs";
import { genresOf, type StatsSong as Song } from "./stats";

// Groq picks artists from your own library; the model never names a song, so it can't invent one.

const MAX_CATALOG = 700;
const DEFAULT_SIZE = 30;
const MAX_SIZE = 60;
const FAMILIAR = 0.5;

export interface Plan {
  name: string;
  description: string;
  artists: string[];
  years?: [number, number];
  size?: number;
}

interface Artist {
  name: string;
  songs: Song[];
  plays: number;
}

/** Your library by artist (normalized), without songs marked "never in shuffle or radio", with your play counts. */
export function libraryArtists(db: Database, server: string, account: string): { artists: Map<string, Artist>; played: Set<string> } {
  const never = new Set(
    readPrefs(db, account)
      .songs.filter((pref) => pref.never)
      .map((pref) => pref.id),
  );
  const artists = new Map<string, Artist>();
  for (const row of db.query<{ data: string }, [string]>("select data from idx_items where server = ? and kind = 'song'").all(server)) {
    const song = JSON.parse(row.data) as Song;
    if (never.has(song.id) || !song.artist) continue;
    const key = normalize(song.artist);
    const artist = artists.get(key) ?? { name: song.artist, songs: [], plays: 0 };
    artist.songs.push(song);
    artists.set(key, artist);
  }
  const played = new Set<string>();
  for (const row of db.query<{ song: string }, [string]>("select song from plays where account = ? and skipped = 0").all(account)) {
    const song = JSON.parse(row.song) as Song;
    played.add(keyOf(song));
    const artist = song.artist ? artists.get(normalize(song.artist)) : undefined;
    if (artist) artist.plays++;
  }
  return { artists, played };
}

const yearOf = (song: Song) => (typeof song.year === "number" && song.year > 0 ? song.year : null);

function catalog(artists: Map<string, Artist>, limit = MAX_CATALOG): string {
  return [...artists.values()]
    .sort((a, b) => b.plays - a.plays || b.songs.length - a.songs.length)
    .slice(0, limit)
    .map((artist) => {
      const years = artist.songs.map(yearOf).filter((year): year is number => year !== null);
      const genres = [...new Set(artist.songs.flatMap(genresOf).map((genre) => genre.toLowerCase()))].slice(0, 3);
      return [
        artist.name,
        `${artist.songs.length} songs`,
        years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "",
        genres.join("/"),
        artist.plays ? `you played ${artist.plays}×` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    })
    .join("\n");
}

export function parsePlan(text: string, artists: Map<string, Artist>): Plan | null {
  let value: unknown;
  try {
    value = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
  const raw = value as Partial<Record<keyof Plan, unknown>>;
  const names = Array.isArray(raw.artists) ? raw.artists.filter((name): name is string => typeof name === "string") : [];
  const known = [...new Set(names.map(normalize))].filter((key) => artists.has(key)).map((key) => artists.get(key)?.name as string);
  if (!known.length || typeof raw.name !== "string") return null;
  const years =
    Array.isArray(raw.years) && raw.years.length === 2 && raw.years.every((year) => typeof year === "number" && year > 1800)
      ? ([Math.min(...raw.years), Math.max(...raw.years)] as [number, number])
      : undefined;
  const size = typeof raw.size === "number" ? Math.max(10, Math.min(MAX_SIZE, Math.round(raw.size))) : undefined;
  return {
    name: raw.name.toLowerCase().slice(0, 80),
    description: typeof raw.description === "string" ? raw.description.slice(0, 200) : "",
    artists: known,
    ...(years ? { years } : {}),
    ...(size ? { size } : {}),
  };
}

export function buildPlaylist(plan: Plan, artists: Map<string, Artist>, played: Set<string>, seed: string): Song[] {
  const random = seeded(seed);
  const size = plan.size ?? DEFAULT_SIZE;
  const inEra = (song: Song) => {
    const year = yearOf(song);
    return !plan.years || year === null || (year >= plan.years[0] && year <= plan.years[1]);
  };
  const pools = plan.artists.map((name) => {
    const songs = shuffle((artists.get(normalize(name))?.songs ?? []).filter(inEra), random);
    return { familiar: songs.filter((song) => played.has(keyOf(song))), fresh: songs.filter((song) => !played.has(keyOf(song))) };
  });
  const picked: Song[] = [];
  const seen = new Set<string>();
  // Round-robin, so one big discography doesn't fill the list; a familiar pick, then a fresh one, by the share.
  for (let round = 0; picked.length < size && pools.some((pool) => pool.familiar.length || pool.fresh.length); round++)
    for (const pool of pools) {
      if (picked.length >= size) break;
      const wantFamiliar = picked.filter((song) => played.has(keyOf(song))).length < picked.length * FAMILIAR + 1;
      const song = (wantFamiliar ? pool.familiar.shift() : pool.fresh.shift()) ?? pool.familiar.shift() ?? pool.fresh.shift();
      if (song && !seen.has(keyOf(song))) {
        seen.add(keyOf(song));
        picked.push(song);
      }
    }
  return shuffle(picked, random);
}

const SYSTEM = `You make playlists from a person's own music library. You get their request and a catalog of the artists in their library, one per line: name · song count · years · genres · how often they played them.
Answer with JSON only: {"name": short lowercase playlist name, "description": one short line, "artists": 3 to 12 artist names copied exactly from the catalog, "years": [from, to] only if the request implies an era, "size": number of songs (default 30)}.
Pick artists that fit the mood, sound and era asked for, from what you know about them. Never name an artist that isn't in the catalog. Prefer artists they play when it fits, and mix in a few they don't.`;

export async function askGroq(
  { key, model, url }: { key: string; model: string; url: string },
  prompt: string,
  artists: Map<string, Artist>,
  fetcher: typeof fetch = fetch,
): Promise<Plan | null> {
  const response = await fetcher(`${url}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_completion_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Request: ${prompt.slice(0, 300)}\n\nCatalog:\n${catalog(artists)}` },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const text = body?.choices?.[0]?.message?.content;
  return text ? parsePlan(text, artists) : null;
}
