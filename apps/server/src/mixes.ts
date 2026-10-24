import type { Database } from "bun:sqlite";
import { readPrefs } from "./prefs";
import { genresOf, type StatsSong as Song } from "./stats";

const DAY = 86_400_000;
const WINDOW_DAYS = 90;
const MIXES = 6;
const PER_MIX = 50;
/** Share of a mix that is songs you already play; the rest is the same genre and artists you rarely or never play. */
const FAMILIAR = 0.6;
/** A genre needs this many counted plays in the window to get a mix. */
const MIN_PLAYS = 5;

export interface Mix {
  id: string;
  name: string;
  /** "synthwave · artist a, artist b, artist c" */
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

/**
 * Up to six mixes for the day, one per genre you play most, like Spotify's daily mixes but only from your library.
 * Each is mostly songs you play in that genre plus some by the same artists or genre that you rarely or never play.
 * Songs you marked "never in shuffle or radio" stay out. `day` (days since the epoch) seeds the picks.
 */
export function dailyMixes(db: Database, server: string, account: string, day: number, now = Date.now()): Mix[] {
  const played = db
    .query<{ song: string; n: number }, [string, number]>(
      `select p.song, s.n from plays p join (
         select song_id, count(*) as n, max(id) as latest from plays
         where account = ? and skipped = 0 and started >= ? group by song_id
       ) s on s.latest = p.id order by s.n desc`,
    )
    .all(account, now - WINDOW_DAYS * DAY)
    .map((row) => ({ song: JSON.parse(row.song) as Song, plays: row.n }));
  if (!played.length) return [];

  const never = new Set(
    readPrefs(db, account)
      .songs.filter((pref) => pref.never)
      .map((pref) => pref.id),
  );
  const byGenre = new Map<string, { plays: number; songs: Song[]; artists: Map<string, number> }>();
  for (const { song, plays } of played) {
    for (const genre of genresOf(song)) {
      const entry = byGenre.get(genre) ?? { plays: 0, songs: [] as Song[], artists: new Map<string, number>() };
      entry.plays += plays;
      entry.songs.push(song);
      if (song.artist) entry.artists.set(song.artist, (entry.artists.get(song.artist) ?? 0) + plays);
      byGenre.set(genre, entry);
    }
  }
  const genres = [...byGenre.entries()]
    .filter(([, entry]) => entry.plays >= MIN_PLAYS)
    .sort((a, b) => b[1].plays - a[1].plays)
    .slice(0, MIXES);
  if (!genres.length) return [];

  const library = db
    .query<{ data: string }, [string]>("select data from idx_items where server = ? and kind = 'song'")
    .all(server)
    .map((row) => JSON.parse(row.data) as Song);
  const playedIds = new Set(played.map(({ song }) => song.id));

  return genres.map(([genre, entry], index) => {
    const random = seeded(`${account}:${day}:${genre}`);
    const topArtists = [...entry.artists.entries()].sort((a, b) => b[1] - a[1]).map(([artist]) => artist);
    const artistSet = new Set(topArtists.slice(0, 8));
    const familiar = shuffle(entry.songs, random).slice(0, Math.round(PER_MIX * FAMILIAR));
    const fresh = shuffle(
      library.filter(
        (song) => !playedIds.has(song.id) && (genresOf(song).includes(genre) || (song.artist !== undefined && artistSet.has(song.artist))),
      ),
      random,
    ).slice(0, PER_MIX - familiar.length);
    const songs = shuffle([...familiar, ...fresh], random).filter((song) => !never.has(song.id));
    return {
      id: `daily-${index + 1}`,
      name: `daily mix ${index + 1}`,
      description: `${genre.toLowerCase()} · ${topArtists.slice(0, 3).join(", ")}`,
      songs,
    };
  });
}
