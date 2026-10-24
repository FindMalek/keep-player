import type { Database } from "bun:sqlite";
import { normalize } from "@keep/shared/normalize";
import { readPrefs } from "./prefs";
import type { StatsSong as Song } from "./stats";

const DAY = 86_400_000;
const WINDOW_DAYS = 90;
const MIXES = 6;
const PER_MIX = 50;
/** Share of a mix that is songs you already play; the rest is the same artists' songs you rarely or never play. */
const FAMILIAR = 0.6;
/** An artist needs this many counted plays in the window to seed a mix. */
const MIN_PLAYS = 5;
/** Artists played this close together count as listened to together. */
const SESSION_MS = 2 * 3_600_000;
/** A mix is its seed artist plus up to this many artists you play around them. */
const NEIGHBOURS = 4;

export interface Mix {
  id: string;
  name: string;
  /** "artist a, artist b, artist c" */
  description: string;
  songs: Song[];
}

/** A small seeded PRNG, so a day's mixes are the same on every device and every reload. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

const keyOf = (song: { artist?: string; title?: string }) => `${normalize(song.artist ?? "")}\u0000${normalize(song.title ?? "")}`;

/**
 * Up to six mixes for the day, like Spotify's daily mixes but only from your library. Each starts from an artist you
 * play a lot and takes in the artists you play around the same time; it's mostly their songs you play plus some you
 * rarely or never play. Plays are matched to the library by artist and title, not id: Navidrome gives a song a new id
 * when its file moves (a tagger renaming it), and genre tags are too often missing to group by.
 * Songs you marked "never in shuffle or radio" stay out. `day` (days since the epoch) seeds the picks.
 */
export function dailyMixes(db: Database, server: string, account: string, day: number, now = Date.now()): Mix[] {
  const plays = db
    .query<{ song: string; started: number }, [string, number]>(
      "select song, started from plays where account = ? and skipped = 0 and started >= ? order by started",
    )
    .all(account, now - WINDOW_DAYS * DAY)
    .map((row) => ({ song: JSON.parse(row.song) as Song, started: row.started }));
  if (!plays.length) return [];

  const never = new Set(
    readPrefs(db, account)
      .songs.filter((pref) => pref.never)
      .map((pref) => pref.id),
  );
  const byArtist = new Map<string, Song[]>();
  for (const row of db.query<{ data: string }, [string]>("select data from idx_items where server = ? and kind = 'song'").all(server)) {
    const song = JSON.parse(row.data) as Song;
    if (never.has(song.id) || !song.artist) continue;
    const artist = normalize(song.artist);
    byArtist.set(artist, [...(byArtist.get(artist) ?? []), song]);
  }

  // Plays per artist, the songs you play (by artist + title), and who you play next to whom.
  const counts = new Map<string, number>();
  const playedKeys = new Set<string>();
  const together = new Map<string, Map<string, number>>();
  for (const [index, play] of plays.entries()) {
    if (!play.song.artist) continue;
    const artist = normalize(play.song.artist);
    counts.set(artist, (counts.get(artist) ?? 0) + 1);
    playedKeys.add(keyOf(play.song));
    for (let j = index + 1; j < plays.length; j++) {
      const next = plays[j];
      if (!next || next.started - play.started > SESSION_MS) break;
      const other = next.song.artist ? normalize(next.song.artist) : "";
      if (!other || other === artist) continue;
      for (const [a, b] of [
        [artist, other],
        [other, artist],
      ] as const) {
        const row = together.get(a) ?? new Map<string, number>();
        row.set(b, (row.get(b) ?? 0) + 1);
        together.set(a, row);
      }
    }
  }

  const seeds = [...counts.entries()]
    .filter(([artist, n]) => n >= MIN_PLAYS && byArtist.has(artist))
    .sort((a, b) => b[1] - a[1])
    .map(([artist]) => artist);
  const used = new Set<string>();
  const mixes: Mix[] = [];
  for (const seed of seeds) {
    if (mixes.length === MIXES) break;
    // An artist already in an earlier mix doesn't start another one.
    if (used.has(seed)) continue;
    const neighbours = [...(together.get(seed) ?? new Map<string, number>()).entries()]
      .filter(([artist]) => byArtist.has(artist))
      .sort((a, b) => b[1] - a[1])
      .slice(0, NEIGHBOURS)
      .map(([artist]) => artist);
    const artists = [seed, ...neighbours];
    for (const artist of artists) used.add(artist);

    const random = seeded(`${account}:${day}:${seed}`);
    const pool = artists.flatMap((artist) => byArtist.get(artist) ?? []);
    const familiar = shuffle(
      pool.filter((song) => playedKeys.has(keyOf(song))),
      random,
    ).slice(0, Math.round(PER_MIX * FAMILIAR));
    const fresh = shuffle(
      pool.filter((song) => !playedKeys.has(keyOf(song))),
      random,
    ).slice(0, PER_MIX - familiar.length);
    mixes.push({
      id: `daily-${mixes.length + 1}`,
      name: `daily mix ${mixes.length + 1}`,
      description: artists
        .slice(0, 3)
        .map((artist) => byArtist.get(artist)?.[0]?.artist ?? artist)
        .join(", "),
      songs: shuffle([...familiar, ...fresh], random),
    });
  }
  return mixes;
}
