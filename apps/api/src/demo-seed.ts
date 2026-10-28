import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import type { Upstream } from "./config";
import { type NewPlay, recordPlay } from "./history";
import { subsonic } from "./subsonic";

// `DEMO_SEED=on` (PR previews): deterministic, so previews, screenshots and the README see the same history.

const DAY = 86_400_000;
type Song = { id: string; duration?: number } & Record<string, unknown>;

function random(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generatePlays(songs: Song[], now: number, days = 180, seed = 7): NewPlay[] {
  if (songs.length === 0) return [];
  const next = random(seed);
  // Shuffle once, then weight by rank: the first few get most of the plays.
  const order = [...songs].sort(() => next() - 0.5);
  const weights = order.map((_, rank) => 1 / (rank + 3) ** 0.9);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const pick = (): Song => {
    let target = next() * total;
    for (const [index, weight] of weights.entries()) {
      target -= weight;
      if (target <= 0) return order[index] as Song;
    }
    return order[0] as Song;
  };
  const plays: NewPlay[] = [];
  for (let back = days; back >= 0; back -= 1) {
    const day = new Date(now - back * DAY);
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    const count = next() < 0.15 ? 0 : Math.floor(next() * (weekend ? 34 : 22));
    const sessions = [8.5 + next() * 1.5, 19 + next() * 3];
    for (let i = 0; i < count; i += 1) {
      const song = pick();
      const duration = song.duration ?? 200;
      const hour = (sessions[next() < 0.35 ? 0 : 1] as number) + (i / Math.max(count, 1)) * 2.5;
      const started = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) + hour * 3_600_000;
      if (started > now) continue;
      const roll = next();
      const finished = roll < 0.82;
      const listened = finished ? duration : roll < 0.92 ? Math.floor(3 + next() * 24) : Math.floor(duration * (0.3 + next() * 0.6));
      plays.push({ song, started, listened, finished });
    }
  }
  return plays;
}

export function seedHistory(db: Database, account: string, songs: Song[], now = Date.now()): number {
  const existing = db.query<{ n: number }, [string]>("select count(*) as n from plays where account = ?").get(account)?.n ?? 0;
  if (existing > 0) return 0;
  const plays = generatePlays(songs, now);
  db.transaction(() => {
    for (const play of plays) recordPlay(db, account, "lodesong", play);
  })();
  return plays.length;
}

export async function demoSongs(upstream: Upstream, user: string, password: string): Promise<Song[]> {
  const salt = randomBytes(8).toString("hex");
  const credentials = {
    user,
    salt,
    token: createHash("md5")
      .update(password + salt)
      .digest("hex"),
  };
  const list = await subsonic<{ albumList2?: { album?: { id: string }[] } }>(upstream, credentials, "getAlbumList2", {
    type: "alphabeticalByName",
    size: 500,
  });
  const songs: Song[] = [];
  for (const { id } of list?.albumList2?.album ?? []) {
    const album = await subsonic<{ album?: { song?: Song[] } }>(upstream, credentials, "getAlbum", { id });
    songs.push(...(album?.album?.song ?? []));
  }
  return songs;
}

/** Waits for the demo Navidrome (it may still be starting), then seeds once. */
export async function seedDemoHistory(db: Database, upstream: Upstream, user: string, password: string): Promise<void> {
  const account = `${upstream.id}:${user}`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const songs = await demoSongs(upstream, user, password);
    if (songs.length > 0) {
      const written = seedHistory(db, account, songs);
      if (written > 0) console.info(`keep-player: demo history seeded (${written} plays)`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  console.warn("keep-player: demo history not seeded, the library never answered");
}
