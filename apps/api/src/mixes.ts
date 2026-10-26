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
const DISCOVER_SIZE = 30;
/** Share of Discover Weekly from artists you play; the rest is artists you've never played at all. */
const DISCOVER_KNOWN = 0.6;
const DAYLIST_SIZE = 40;
const RADAR_DAYS = 30;
const RADAR_SIZE = 40;
/** "On this day" looks at plays this many days either side of the date a year ago. */
const ON_THIS_DAY_SPREAD = 3;

export interface Mix {
  id: string;
  name: string;
  /** "artist a, artist b, artist c" */
  description: string;
  songs: Song[];
}

/** Parts of the day for the daylist, by local hour. */
export const SLOTS = [
  ["morning", 5, 12],
  ["afternoon", 12, 17],
  ["evening", 17, 22],
  ["night", 22, 29],
] as const;
export type Slot = (typeof SLOTS)[number][0];

export function slotOf(hour: number): Slot {
  const h = hour < 5 ? hour + 24 : hour;
  return SLOTS.find(([, from, to]) => h >= from && h < to)?.[0] ?? "night";
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
/** Day 0 (1970-01-01) was a Thursday. */
export const weekdayOf = (day: number) => (day + 4) % 7;
/** The last Friday on or before `day`: Discover Weekly turns over then. */
export const lastFriday = (day: number) => day - ((weekdayOf(day) - 5 + 7) % 7);

/** A small seeded PRNG, so a day's mixes are the same on every device and every reload. */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

export const keyOf = (song: { artist?: string; title?: string }) => `${normalize(song.artist ?? "")}\u0000${normalize(song.title ?? "")}`;

export interface Listening {
  plays: { song: Song; started: number }[];
  /** The library by artist (normalized), without songs marked "never in shuffle or radio". */
  byArtist: Map<string, Song[]>;
  counts: Map<string, number>;
  /** Songs you played, by artist + title. */
  playedKeys: Set<string>;
  /** artist → artists you play within two hours of them → how often. */
  together: Map<string, Map<string, number>>;
}

/**
 * What you listen to, matched to the library as it is now. Plays are matched by artist and title, not id: Navidrome
 * gives a song a new id when its file moves (a tagger renaming it), and genre tags are too often missing to group by.
 */
export function listening(db: Database, server: string, account: string, now: number): Listening | null {
  const plays = db
    .query<{ song: string; started: number }, [string, number]>(
      "select song, started from plays where account = ? and skipped = 0 and started >= ? order by started",
    )
    .all(account, now - WINDOW_DAYS * DAY)
    .map((row) => ({ song: JSON.parse(row.song) as Song, started: row.started }));
  if (!plays.length) return null;
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
  return { plays, byArtist, counts, playedKeys, together };
}

/** Mostly songs by `artists` you play, the rest theirs you rarely or never play, shuffled. */
export function blend(l: Listening, artists: string[], size: number, random: () => number): Song[] {
  const pool = artists.flatMap((artist) => l.byArtist.get(artist) ?? []);
  const familiar = shuffle(
    pool.filter((song) => l.playedKeys.has(keyOf(song))),
    random,
  ).slice(0, Math.round(size * FAMILIAR));
  const fresh = shuffle(
    pool.filter((song) => !l.playedKeys.has(keyOf(song))),
    random,
  ).slice(0, size - familiar.length);
  return shuffle([...familiar, ...fresh], random);
}

const artistNames = (l: Listening, artists: string[]) =>
  artists
    .slice(0, 3)
    .map((artist) => l.byArtist.get(artist)?.[0]?.artist ?? artist)
    .join(", ");

const topNeighbours = (l: Listening, artist: string, count: number) =>
  [...(l.together.get(artist) ?? new Map<string, number>()).entries()]
    .filter(([other]) => l.byArtist.has(other))
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([other]) => other);

/**
 * Up to six mixes for the day, like Spotify's daily mixes but only from your library. Each starts from an artist you
 * play a lot and takes in the artists you play around the same time. `day` (days since the epoch) seeds the picks.
 */
function daily(l: Listening, account: string, day: number): Mix[] {
  const seeds = [...l.counts.entries()]
    .filter(([artist, n]) => n >= MIN_PLAYS && l.byArtist.has(artist))
    .sort((a, b) => b[1] - a[1])
    .map(([artist]) => artist);
  const used = new Set<string>();
  const mixes: Mix[] = [];
  for (const seed of seeds) {
    if (mixes.length === MIXES) break;
    // An artist already in an earlier mix doesn't start another one.
    if (used.has(seed)) continue;
    const artists = [seed, ...topNeighbours(l, seed, NEIGHBOURS)];
    for (const artist of artists) used.add(artist);
    mixes.push({
      id: `daily-${mixes.length + 1}`,
      name: `daily mix ${mixes.length + 1}`,
      description: artistNames(l, artists),
      songs: blend(l, artists, PER_MIX, seeded(`${account}:${day}:${seed}`)),
    });
  }
  return mixes;
}

/**
 * Discover Weekly, new every Friday: songs in your library you've never played, most by artists you play (the ones you
 * play most count most), the rest by artists you've never played at all.
 */
function discover(l: Listening, account: string, friday: number): Mix | null {
  const random = seeded(`${account}:discover:${friday}`);
  const unplayed = (artist: string) => (l.byArtist.get(artist) ?? []).filter((song) => !l.playedKeys.has(keyOf(song)));
  const liked = [...l.counts.entries()].sort((a, b) => b[1] - a[1]).map(([artist]) => artist);
  const known: Song[] = [];
  // Round-robin over your artists, best first, so one big discography doesn't take every slot.
  const queues = liked.map((artist) => shuffle(unplayed(artist), random)).filter((queue) => queue.length);
  const knownSize = Math.round(DISCOVER_SIZE * DISCOVER_KNOWN);
  for (let round = 0; known.length < knownSize && queues.some((queue) => queue.length > round); round++)
    for (const queue of queues) {
      const song = queue[round];
      if (song && known.length < knownSize) known.push(song);
    }
  const strangers = [...l.byArtist.keys()].filter((artist) => !l.counts.has(artist));
  const fresh = shuffle(strangers, random)
    .map((artist) => shuffle(l.byArtist.get(artist) ?? [], random)[0])
    .filter((song): song is Song => Boolean(song))
    .slice(0, DISCOVER_SIZE - known.length);
  const songs = shuffle([...known, ...fresh], random);
  if (!songs.length) return null;
  return {
    id: "discover-weekly",
    name: "discover weekly",
    description: "songs you own and never played, picked for you every friday",
    songs,
  };
}

/** Release radar, new every Friday: songs added to the library in the last month by artists you play, newest first. */
function releaseRadar(l: Listening, now: number): Mix | null {
  const since = now - RADAR_DAYS * DAY;
  const fresh = [...l.byArtist.entries()]
    .filter(([artist]) => l.counts.has(artist))
    .flatMap(([, songs]) => songs)
    .map((song) => ({ song, added: Date.parse(typeof song.created === "string" ? song.created : "") }))
    .filter((item) => item.added >= since)
    .sort((a, b) => b.added - a.added || (Number(a.song.track) || 0) - (Number(b.song.track) || 0))
    .slice(0, RADAR_SIZE)
    .map((item) => item.song);
  if (!fresh.length) return null;
  const artists = [...new Set(fresh.map((song) => normalize(song.artist ?? "")))];
  return { id: "release-radar", name: "release radar", description: `new in your library: ${artistNames(l, artists)}`, songs: fresh };
}

/** What you played around this date a year ago, most played first, as it is in the library now. */
function onThisDay(db: Database, l: Listening, account: string, now: number): Mix | null {
  const center = now - 365 * DAY;
  const rows = db
    .query<{ song: string }, [string, number, number]>(
      "select song from plays where account = ? and skipped = 0 and started >= ? and started < ?",
    )
    .all(account, center - ON_THIS_DAY_SPREAD * DAY, center + ON_THIS_DAY_SPREAD * DAY);
  if (!rows.length) return null;
  const library = new Map<string, Song>();
  for (const songs of l.byArtist.values()) for (const song of songs) library.set(keyOf(song), song);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(JSON.parse(row.song) as Song);
    if (library.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const songs = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([key]) => library.get(key) as Song);
  if (!songs.length) return null;
  const date = new Date(center).toLocaleDateString("en", { month: "long", day: "numeric" }).toLowerCase();
  return { id: "on-this-day", name: "on this day", description: `what you played around ${date} last year`, songs };
}

/**
 * The daylist: what you tend to play at this time of day (by your local hour), mostly the songs you play then plus some
 * by the same artists you haven't. Changes four times a day.
 */
function daylist(l: Listening, account: string, day: number, slot: Slot, tzMinutes: number): Mix | null {
  const counts = new Map<string, number>();
  for (const play of l.plays) {
    if (!play.song.artist) continue;
    const hour = Math.floor(((play.started - tzMinutes * 60_000) % DAY) / 3_600_000);
    if (slotOf((hour + 24) % 24) !== slot) continue;
    const artist = normalize(play.song.artist);
    counts.set(artist, (counts.get(artist) ?? 0) + 1);
  }
  const artists = [...counts.entries()]
    .filter(([artist]) => l.byArtist.has(artist))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([artist]) => artist);
  if (!artists.length) return null;
  const songs = blend(l, artists, DAYLIST_SIZE, seeded(`${account}:${day}:${slot}`));
  return { id: "daylist", name: "daylist", description: `${WEEKDAYS[weekdayOf(day)]} ${slot}: ${artistNames(l, artists)}`, songs };
}

/**
 * Everything made for you right now: up to six daily mixes, Discover Weekly and the daylist. `day` is the browser's
 * local days since the epoch, `hour` its local hour and `tzMinutes` its `getTimezoneOffset()`.
 */
export function madeForYou(
  db: Database,
  server: string,
  account: string,
  { day, hour, tzMinutes }: { day: number; hour: number; tzMinutes: number },
  now = Date.now(),
): Mix[] {
  const l = listening(db, server, account, now);
  if (!l) return [];
  return [
    ...daily(l, account, day),
    discover(l, account, lastFriday(day)),
    releaseRadar(l, now),
    onThisDay(db, l, account, now),
    daylist(l, account, day, slotOf(hour), tzMinutes),
  ].filter((mix): mix is Mix => mix !== null);
}

/** Changes whenever made for you would: a play, a sync of the library index, a song marked "never in shuffle". */
export function mixesVersion(db: Database, server: string, account: string): string {
  const plays = db
    .query<{ count: number; last: number | null }, [string]>("select count(*) as count, max(rowid) as last from plays where account = ?")
    .get(account);
  // The index tables exist only once the index has run.
  const synced = (() => {
    try {
      return db.query<{ value: string }, [string]>("select value from meta where key = ?").get(`index-last-sync:${server}`)?.value ?? "";
    } catch {
      return "";
    }
  })();
  const never = db
    .query<{ ids: string | null }, [string]>("select group_concat(song_id) as ids from song_prefs where account = ? and never = 1")
    .get(account)?.ids;
  return Bun.hash(`${plays?.count}:${plays?.last}:${synced}:${never ?? ""}`).toString(36);
}

/** The daily mixes alone. */
export function dailyMixes(db: Database, server: string, account: string, day: number, now = Date.now()): Mix[] {
  const l = listening(db, server, account, now);
  return l ? daily(l, account, day) : [];
}
