import type { Database } from "bun:sqlite";
import { normalize } from "@keep/shared/normalize";
import { blend, type Listening, type Mix, seeded } from "./mixes";

/*
 * Mood mixes (#57): focus, late night, energy. Once a week Groq sorts the artists you play into those moods (one call
 * per account per week, cached in `meta`); every day each mood is a fresh blend of those artists' songs you own.
 */

const MOODS = ["focus", "late night", "energy"] as const;
type Mood = (typeof MOODS)[number];

const MOOD_SIZE = 30;
const ARTISTS_ASKED = 80;
const DESCRIPTIONS: Record<Mood, string> = {
  focus: "steady and unobtrusive, for getting things done",
  "late night": "slow and close, for after dark",
  energy: "loud and quick, to get you moving",
};

const SYSTEM = `You sort a person's favourite artists into listening moods. Answer with JSON only:
{"focus": [artist names], "late night": [artist names], "energy": [artist names]}
Use names copied exactly from the list. An artist can be in more than one mood or in none. Give 3 to 10 per mood when the list allows.`;

type Moods = Partial<Record<Mood, string[]>>;

export type Groq = { key: string; model: string; url: string };

/**
 * One JSON answer from Groq for a week, cached in `meta` under `${prefix}:${account}:${week}`: asked once a week per
 * account (and again next time only if it failed); the week before is deleted when a new one is stored.
 */
export async function weeklyAnswer<T>(
  db: Database,
  groq: Groq,
  prefix: string,
  account: string,
  week: number,
  ask: { system: string; user: string },
  fetcher: typeof fetch,
): Promise<T | null> {
  db.run("create table if not exists meta (key text primary key, value text not null)");
  const key = `${prefix}:${account}:${week}`;
  const row = db.query<{ value: string }, [string]>("select value from meta where key = ?").get(key);
  if (row) {
    try {
      return JSON.parse(row.value) as T;
    } catch {
      // A broken entry is asked again below.
    }
  }
  const response = await fetcher(`${groq.url}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${groq.key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: groq.model,
      temperature: 0.2,
      max_completion_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ask.system },
        { role: "user", content: ask.user },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  let answer: T;
  try {
    answer = JSON.parse(body?.choices?.[0]?.message?.content ?? "") as T;
  } catch {
    return null;
  }
  db.query("insert or replace into meta (key, value) values (?, ?)").run(key, JSON.stringify(answer));
  db.query("delete from meta where key like ? and key != ?").run(`${prefix}:${account}:%`, key);
  return answer;
}

/** The artists you play most, as the library spells them. */
export function topArtistNames(l: Listening, limit: number): string[] {
  return [...l.counts.entries()]
    .filter(([artist]) => l.byArtist.has(artist))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([artist]) => l.byArtist.get(artist)?.[0]?.artist ?? artist);
}

/** Focus, late night and energy for today; none without Groq or enough listening. */
export async function moodMixes(
  db: Database,
  groq: Groq | null,
  account: string,
  day: number,
  l: Listening | null,
  fetcher: typeof fetch = fetch,
): Promise<Mix[]> {
  if (!groq || !l) return [];
  const names = topArtistNames(l, ARTISTS_ASKED);
  if (names.length < 3) return [];
  const moods = await weeklyAnswer<Moods>(
    db,
    groq,
    "moods",
    account,
    Math.floor(day / 7),
    { system: SYSTEM, user: names.join("\n") },
    fetcher,
  );
  if (!moods) return [];
  return MOODS.flatMap((mood) => {
    const artists = [...new Set((moods[mood] ?? []).filter((name) => typeof name === "string").map(normalize))].filter((artist) =>
      l.byArtist.has(artist),
    );
    if (!artists.length) return [];
    const songs = blend(l, artists, MOOD_SIZE, seeded(`${account}:${day}:${mood}`));
    return songs.length ? [{ id: `mood-${mood.replace(" ", "-")}`, name: `${mood} mix`, description: DESCRIPTIONS[mood], songs }] : [];
  });
}
