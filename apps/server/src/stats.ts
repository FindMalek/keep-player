import type { Database } from "bun:sqlite";
import type { ListeningStats, StatItem } from "@keep/shared/stats";

/*
 * Listening stats from the plays table (#59): any range, not only once a year. Days and the listening clock use the
 * viewer's time zone, passed as minutes east of UTC (what `-new Date().getTimezoneOffset()` gives).
 */

const DAY = 86_400_000;
const TOP = 10;
/** A play that counts: not a skip. Skips still count toward minutes. */
const COUNTED = "skipped = 0";

interface Row {
  song_id: string;
  song: string;
  started: number;
  listened: number;
  skipped: number;
}

type Song = { id: string; title?: string; artist?: string; artistId?: string; album?: string; albumId?: string; genre?: string } & Record<
  string,
  unknown
>;

export type { Song as StatsSong };

const localDay = (time: number, tz: number) => Math.floor((time + tz * 60_000) / DAY);

function top(map: Map<string, StatItem>): StatItem[] {
  return [...map.values()].sort((a, b) => b.plays - a.plays || b.minutes - a.minutes).slice(0, TOP);
}

function bump(map: Map<string, StatItem>, id: string, name: string, minutes: number, counted: boolean, extra?: Partial<StatItem>) {
  const item = map.get(id) ?? { id, name, plays: 0, minutes: 0, ...extra };
  if (counted) item.plays++;
  item.minutes += minutes;
  map.set(id, item);
}

/** Consecutive local days with at least one counted play: the longest run ever, and the one still going (today or yesterday). */
export function streaks(days: number[], today: number): { current: number; longest: number } {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  for (let at = 0; at < sorted.length; at++) {
    run = at > 0 && sorted[at] === (sorted[at - 1] as number) + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  let current = 0;
  const set = new Set(sorted);
  let day = set.has(today) ? today : today - 1;
  while (set.has(day)) {
    current++;
    day--;
  }
  return { current, longest };
}

export function listeningStats(db: Database, account: string, from: number, to: number, tz: number, now = Date.now()): ListeningStats {
  const rows = db
    .query<Row, [string, number, number]>(
      "select song_id, song, started, listened, skipped from plays where account = ? and started >= ? and started < ? order by started",
    )
    .all(account, from, to);
  // First time each song in range was ever heard here: new in this range or already familiar.
  const firstHeard = new Map(
    db
      .query<{ song_id: string; first: number }, [string, string, number, number]>(
        `select song_id, min(started) as first from plays where account = ? and ${COUNTED}
         and song_id in (select song_id from plays where account = ? and started >= ? and started < ?) group by song_id`,
      )
      .all(account, account, from, to)
      .map((row) => [row.song_id, row.first]),
  );

  const songs = new Map<string, StatItem>();
  const artists = new Map<string, StatItem>();
  const albums = new Map<string, StatItem>();
  const genres = new Map<string, StatItem>();
  const clock = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const byDay = new Map<number, number>();
  let seconds = 0;
  let plays = 0;
  let skips = 0;
  const heard = new Set<string>();
  for (const row of rows) {
    const song = JSON.parse(row.song) as Song;
    const minutes = row.listened / 60;
    const counted = row.skipped === 0;
    seconds += row.listened;
    if (counted) {
      plays++;
      heard.add(row.song_id);
    } else skips++;
    const local = new Date(row.started + tz * 60_000);
    const hours = clock[local.getUTCDay()] as number[];
    hours[local.getUTCHours()] = (hours[local.getUTCHours()] ?? 0) + minutes;
    const day = localDay(row.started, tz);
    byDay.set(day, (byDay.get(day) ?? 0) + minutes);
    bump(songs, row.song_id, song.title ?? row.song_id, minutes, counted, { detail: song.artist, song });
    if (song.artist) bump(artists, song.artistId ?? song.artist, song.artist, minutes, counted);
    if (song.album) bump(albums, song.albumId ?? song.album, song.album, minutes, counted, { detail: song.artist });
    for (const genre of genresOf(song)) bump(genres, genre.toLowerCase(), genre, minutes, counted);
  }
  const fresh = [...heard].filter((id) => (firstHeard.get(id) ?? 0) >= from).length;
  const allDays = db
    .query<{ started: number }, [string]>(`select started from plays where account = ? and ${COUNTED}`)
    .all(account)
    .map((row) => localDay(row.started, tz));
  const firstDay = localDay(from, tz);
  const lastDay = localDay(Math.min(to, now) - 1, tz);
  const days = [];
  for (let day = firstDay; day <= lastDay && days.length < 400; day++)
    days.push({ day: new Date(day * DAY).toISOString().slice(0, 10), minutes: Math.round(byDay.get(day) ?? 0) });

  return {
    from,
    to,
    minutes: Math.round(seconds / 60),
    plays,
    skips,
    songs: heard.size,
    discovery: { fresh, familiar: heard.size - fresh },
    streaks: streaks(allDays, localDay(now, tz)),
    top: { songs: top(songs), artists: top(artists), albums: top(albums), genres: top(genres) },
    clock: clock.map((hours) => hours.map(Math.round)),
    days,
  };
}

/** OpenSubsonic `genres` (several per song) when present, else the single `genre`. */
export function genresOf(song: Song): string[] {
  const list = Array.isArray(song.genres) ? (song.genres as { name?: string }[]).map((genre) => genre.name ?? "").filter(Boolean) : [];
  return list.length ? list : song.genre ? [song.genre] : [];
}

/** Songs you played a lot (3+ counted plays) and not in `days` days, most played first. */
export function forgottenFavourites(db: Database, account: string, days: number, now = Date.now()): Song[] {
  return db
    .query<{ song: string }, [string, number]>(
      `select song from plays p join (
         select song_id, count(*) as n, max(started) as last, max(id) as latest from plays
         where account = ? and ${COUNTED} group by song_id
       ) s on s.latest = p.id
       where s.n >= 3 and s.last < ? order by s.n desc, s.last limit 50`,
    )
    .all(account, now - days * DAY)
    .map((row) => JSON.parse(row.song) as Song);
}
