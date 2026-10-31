import type { Database } from "bun:sqlite";

// Optional AudioMuse-AI (`AUDIOMUSE_URL`): its analysis is copied into our table, so search and shuffle never wait on it.

export interface Features {
  bpm: number;
  key: string;
  energy: number;
  valence: number;
  danceability: number;
}

type Fetcher = typeof fetch;

const PAGE = 500;
const TIMEOUT_MS = 10_000;
const FLATS: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
const PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function createFeatureTables(db: Database): void {
  db.run(`create table if not exists song_features (
    server text not null,
    song_id text not null,
    bpm real not null,
    key text not null,
    energy real not null,
    valence real not null,
    danceability real not null,
    updated integer not null,
    primary key (server, song_id)
  )`);
}

async function get<T>(url: string, path: string, fetcher: Fetcher): Promise<T | null> {
  const response = await fetcher(`${url}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  return response?.ok ? ((await response.json().catch(() => null)) as T | null) : null;
}

interface RawTrack {
  item_id?: unknown;
  tempo?: unknown;
  key?: unknown;
  scale?: unknown;
  energy?: unknown;
  valence?: unknown;
  danceability?: unknown;
}

const unit = (value: unknown) => (typeof value === "number" && value >= 0 && value <= 1 ? value : null);

function readTrack(raw: RawTrack): ({ id: string } & Features) | null {
  const energy = unit(raw.energy);
  const valence = unit(raw.valence);
  const danceability = unit(raw.danceability);
  if (typeof raw.item_id !== "string" || typeof raw.tempo !== "number" || raw.tempo <= 0) return null;
  if (typeof raw.key !== "string" || energy === null || valence === null || danceability === null) return null;
  return {
    id: raw.item_id,
    bpm: Math.round(raw.tempo * 10) / 10,
    key: `${raw.key} ${raw.scale === "minor" ? "minor" : "major"}`,
    energy,
    valence,
    danceability,
  };
}

export async function audiomuseStatus(
  url: string | null,
  db: Database,
  server: string,
  fetcher: Fetcher = fetch,
): Promise<{ enabled: boolean; reachable: boolean; analysed: number }> {
  if (!url) return { enabled: false, reachable: false, analysed: 0 };
  const analysed = db.query<{ n: number }, [string]>("select count(*) as n from song_features where server = ?").get(server)?.n ?? 0;
  return { enabled: true, reachable: (await get(url, "/api/tracks?limit=1", fetcher)) !== null, analysed };
}

export async function syncFeatures(db: Database, server: string, url: string, fetcher: Fetcher = fetch, now = Date.now()): Promise<number> {
  const known = db.query<{ n: number }, [string, string]>(
    "select count(*) as n from idx_items where server = ? and kind = 'song' and id = ?",
  );
  const save = db.query(
    "insert or replace into song_features (server, song_id, bpm, key, energy, valence, danceability, updated) values (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  let stored = 0;
  for (let offset = 0; ; offset += PAGE) {
    const tracks = await get<RawTrack[]>(url, `/api/tracks?offset=${offset}&limit=${PAGE}`, fetcher);
    if (!Array.isArray(tracks) || tracks.length === 0) break;
    for (const raw of tracks) {
      const track = readTrack(raw);
      if (!track || !known.get(server, track.id)?.n) continue;
      save.run(server, track.id, track.bpm, track.key, track.energy, track.valence, track.danceability, now);
      stored += 1;
    }
    if (tracks.length < PAGE) break;
  }
  return stored;
}

export function featuresFor(db: Database, server: string, ids?: string[]): Map<string, Features> {
  const rows = db
    .query<Features & { song_id: string }, [string]>(
      "select song_id, bpm, key, energy, valence, danceability from song_features where server = ?",
    )
    .all(server);
  const wanted = ids && new Set(ids);
  return new Map(rows.filter((row) => !wanted || wanted.has(row.song_id)).map(({ song_id, ...features }) => [song_id, features]));
}

export async function similarSongs(
  db: Database,
  server: string,
  url: string,
  id: string,
  folders: string[] | null,
  count = 20,
  fetcher: Fetcher = fetch,
): Promise<Record<string, unknown>[]> {
  const found = await get<{ item_id?: unknown }[]>(url, `/api/similar_tracks?item_id=${encodeURIComponent(id)}&n=${count}`, fetcher);
  if (!Array.isArray(found)) return [];
  const data = db.query<{ folder: string; data: string }, [string, string]>(
    "select folder, data from idx_items where server = ? and kind = 'song' and id = ?",
  );
  return found.flatMap((hit) => {
    const row = typeof hit.item_id === "string" && hit.item_id !== id ? data.get(server, hit.item_id) : null;
    return row && (!folders || folders.includes(row.folder)) ? [JSON.parse(row.data) as Record<string, unknown>] : [];
  });
}

export function moodOf(features: Features): string {
  if (features.valence >= 0.5) return features.energy >= 0.5 ? "upbeat" : "chill";
  return features.energy >= 0.5 ? "intense" : "sad";
}

function wheel(key: string): { slot: number; minor: boolean } | null {
  const [note = "", scale] = key.split(" ");
  const pitch = PITCHES.indexOf(FLATS[note] ?? note);
  if (pitch < 0) return null;
  const minor = scale === "minor";
  return { slot: (((minor ? pitch + 3 : pitch) % 12) * 7) % 12, minor };
}

function keyDistance(a: string, b: string): number {
  const [x, y] = [wheel(a), wheel(b)];
  if (!x || !y) return 3;
  const apart = Math.abs(x.slot - y.slot);
  return Math.min(apart, 12 - apart) + (x.minor === y.minor ? 0 : 1);
}

// Half and double time count as the same tempo.
function bpmDistance(a: number, b: number): number {
  return Math.min(Math.abs(a - b), Math.abs(a - b * 2), Math.abs(a * 2 - b));
}

// Same songs ordered for flow: close tempo, key and energy to the last, energy peaking two thirds in; unanalysed last.
export function smartShuffle(ids: string[], features: Map<string, Features>): string[] {
  const analysed = ids.filter((id) => features.has(id));
  const rest = ids.filter((id) => !features.has(id));
  const energies = analysed.map((id) => features.get(id)?.energy ?? 0);
  const low = Math.min(...energies);
  const high = Math.max(...energies);
  const target = (step: number) => {
    const progress = analysed.length > 1 ? step / (analysed.length - 1) : 0;
    const arc = progress < 2 / 3 ? progress * 1.5 : 1 - (progress - 2 / 3) * 1.5 * 0.5;
    return low + (high - low) * arc;
  };

  const ordered: string[] = [];
  const left = new Set(analysed);
  let last: Features | undefined;
  while (left.size > 0) {
    const wanted = target(ordered.length);
    let best = "";
    let bestCost = Number.POSITIVE_INFINITY;
    for (const id of left) {
      const song = features.get(id) as Features;
      const cost =
        Math.abs(song.energy - wanted) * 2 +
        (last ? bpmDistance(last.bpm, song.bpm) / 20 + keyDistance(last.key, song.key) / 3 + Math.abs(last.energy - song.energy) : 0);
      if (cost < bestCost) {
        best = id;
        bestCost = cost;
      }
    }
    left.delete(best);
    ordered.push(best);
    last = features.get(best);
  }
  return [...ordered, ...rest];
}
