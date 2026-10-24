import type { Database } from "bun:sqlite";
import { normalize } from "@keep/shared/normalize";
import { blend, type Listening, type Mix, seeded } from "./mixes";

/*
 * Mood mixes (#57): focus, late night, energy. Once a week Groq sorts the artists you play into those moods (one call
 * per account per week, cached in `meta`); every day each mood is a fresh blend of those artists' songs you own.
 */

export const MOODS = ["focus", "late night", "energy"] as const;
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

function cached(db: Database, key: string): Moods | null {
  const row = db.query<{ value: string }, [string]>("select value from meta where key = ?").get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as Moods;
  } catch {
    return null;
  }
}

/** The week's moods for an account: from the cache, else one Groq call (null when it fails; asked again next time). */
async function moodsFor(
  db: Database,
  groq: { key: string; model: string; url: string },
  account: string,
  week: number,
  l: Listening,
  fetcher: typeof fetch,
): Promise<Moods | null> {
  db.run("create table if not exists meta (key text primary key, value text not null)");
  const key = `moods:${account}:${week}`;
  const hit = cached(db, key);
  if (hit) return hit;
  const names = [...l.counts.entries()]
    .filter(([artist]) => l.byArtist.has(artist))
    .sort((a, b) => b[1] - a[1])
    .slice(0, ARTISTS_ASKED)
    .map(([artist]) => l.byArtist.get(artist)?.[0]?.artist ?? artist);
  if (names.length < 3) return null;
  const response = await fetcher(`${groq.url}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${groq.key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: groq.model,
      temperature: 0.2,
      max_completion_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: names.join("\n") },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  let moods: Moods;
  try {
    moods = JSON.parse(body?.choices?.[0]?.message?.content ?? "") as Moods;
  } catch {
    return null;
  }
  db.query("insert or replace into meta (key, value) values (?, ?)").run(key, JSON.stringify(moods));
  // Last week's answer is no use any more.
  db.query("delete from meta where key like ? and key != ?").run(`moods:${account}:%`, key);
  return moods;
}

/** Focus, late night and energy for today; none without Groq or enough listening. */
export async function moodMixes(
  db: Database,
  groq: { key: string; model: string; url: string } | null,
  account: string,
  day: number,
  l: Listening | null,
  fetcher: typeof fetch = fetch,
): Promise<Mix[]> {
  if (!groq || !l) return [];
  const moods = await moodsFor(db, groq, account, Math.floor(day / 7), l, fetcher);
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
