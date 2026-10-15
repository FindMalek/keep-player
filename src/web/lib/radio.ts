import { useSyncExternalStore } from "react";
import { notify } from "./notify";
import { currentSong, player } from "./player";
import { isSkipped } from "./prefs";
import { contextUpcoming } from "./queue";
import { artistOf, pick, type Station } from "./radio-pick";
import { api, HEADERS, onAccountChange } from "./subsonic";
import type { MenuTarget } from "./targets";
import type { Song } from "./types";

export type { Station };

/*
 * Radio (#55): an endless station from a song, album, artist, playlist, genre or your queue. It keeps 10 songs ahead,
 * refilled from Navidrome (similar songs of the station's artists, their top songs, and the genre and era around
 * them), and learns while it plays: 👍 pulls in more like the song, 👎 or a skip under 30 s pushes its artist away,
 * banned songs never come back on any station.
 */

export type RadioSeed = MenuTarget | { kind: "genre"; genre: string } | { kind: "queue" };

const AHEAD = 10;
const REFILL_BELOW = 5;
const SKIP_SECONDS = 30;
const SOURCE_KIND = "radio";

let station: Station | null = null;
let bans = new Set<string>();
let refilling = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

export function useStation(): Station | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => station,
  );
}

const update = (patch: Partial<Station>) => {
  if (!station) return;
  station = { ...station, ...patch };
  emit();
};

const sample = <T>(items: T[], count: number) => [...items].sort(() => Math.random() - 0.5).slice(0, count);

async function seedSongs(seed: RadioSeed): Promise<{ songs: Song[]; name: string }> {
  if (seed.kind === "genre") {
    const { randomSongs } = await api<{ randomSongs: { song?: Song[] } }>("getRandomSongs", { genre: seed.genre, size: 20 });
    return { songs: randomSongs.song ?? [], name: seed.genre };
  }
  if (seed.kind === "queue") {
    const { queue } = player.getState();
    const songs = [queue.current, ...queue.upNext, ...contextUpcoming(queue)].flatMap((entry) => (entry ? [entry.song] : []));
    return { songs, name: "your queue" };
  }
  const { songsOf } = await import("./targets");
  const songs = await songsOf(seed);
  const name =
    seed.kind === "album"
      ? seed.album.name
      : seed.kind === "artist"
        ? seed.artist.name
        : seed.kind === "playlist"
          ? seed.playlist.name
          : (songs[0]?.title ?? "songs");
  return { songs, name };
}

/** Candidates around the station's anchors: similar songs, top songs and the genre/era neighbourhood. Tagged by source. */
async function candidates(current: Station): Promise<{ song: Song; weight: number }[]> {
  const anchors = sample(current.anchors, 4);
  const artists = [...new Map(anchors.filter((song) => song.artistId).map((song) => [song.artistId as string, song])).values()];
  const asks: Promise<{ song: Song; weight: number }[]>[] = [];
  for (const anchor of artists) {
    asks.push(
      api<{ similarSongs2: { song?: Song[] } }>("getSimilarSongs2", { id: anchor.artistId as string, count: 30 }).then(
        ({ similarSongs2 }) => (similarSongs2.song ?? []).map((song) => ({ song, weight: 3 })),
      ),
    );
    if (anchor.artist)
      asks.push(
        api<{ topSongs: { song?: Song[] } }>("getTopSongs", { artist: anchor.artist, count: 10 }).then(({ topSongs }) =>
          (topSongs.song ?? []).map((song) => ({ song, weight: 2 })),
        ),
      );
  }
  const genre = anchors.find((song) => song.genre)?.genre;
  const years = anchors.map((song) => song.year).filter((year): year is number => Boolean(year));
  const era = current.eraLock ?? (years.length ? [Math.min(...years) - 5, Math.max(...years) + 5] : null);
  asks.push(
    api<{ randomSongs: { song?: Song[] } }>("getRandomSongs", {
      size: 40,
      ...(genre ? { genre } : {}),
      ...(era ? { fromYear: era[0], toYear: era[1] } : {}),
    }).then(({ randomSongs }) => (randomSongs.song ?? []).map((song) => ({ song, weight: 1 }))),
  );
  if (current.artistLock)
    asks.push(
      api<{ topSongs: { song?: Song[] } }>("getTopSongs", { artist: current.artistLock.name, count: 50 }).then(({ topSongs }) =>
        (topSongs.song ?? []).map((song) => ({ song, weight: 3 })),
      ),
    );
  // Songs you said never (or hid) stay off every station.
  return (await Promise.allSettled(asks)).flatMap((result) =>
    result.status === "fulfilled" ? result.value.filter(({ song }) => !isSkipped(song)) : [],
  );
}

async function loadBans(): Promise<void> {
  const response = await fetch("/api/radio/bans", { headers: HEADERS }).catch(() => null);
  if (response?.ok) bans = new Set(((await response.json()) as { songs: Song[] }).songs.map((song) => song.id));
}

const isRadioPlaying = () => player.getState().queue.context.source?.kind === SOURCE_KIND;

async function refill(): Promise<void> {
  if (!station || refilling || !isRadioPlaying()) return;
  const ahead = contextUpcoming(player.getState().queue).length;
  if (ahead >= REFILL_BELOW) return;
  refilling = true;
  try {
    const current = station;
    const batch = pick(current, await candidates(current), AHEAD - ahead, bans);
    if (station !== current && station?.name !== current.name) return;
    for (const song of batch) station?.played.add(song.id);
    player.appendToContext(batch);
  } finally {
    refilling = false;
  }
}

// Skips teach the station: a song left within 30 s counts as a 👎 for its artist.
let watching: { id: string; position: number; duration: number } | null = null;
let unsubscribe: (() => void) | null = null;
let ticker: ReturnType<typeof setInterval> | undefined;

function watch(): void {
  unsubscribe?.();
  clearInterval(ticker);
  ticker = setInterval(() => {
    const song = currentSong(player.getState());
    if (song && watching?.id === song.id) watching.position = player.getPosition();
  }, 1000);
  unsubscribe = player.subscribe(() => {
    if (!station) return;
    if (!isRadioPlaying()) {
      stopRadio();
      return;
    }
    const song = currentSong(player.getState());
    if (song?.id === watching?.id) return;
    if (watching && watching.position < SKIP_SECONDS && watching.duration - watching.position > 5) strike(watching.id);
    watching = song ? { id: song.id, position: 0, duration: song.duration ?? 0 } : null;
    void refill();
  });
}

function strike(songId: string): void {
  if (!station) return;
  const song = player.getState().queue.history.find((entry) => entry.song.id === songId)?.song;
  const disliked = new Set(station.disliked).add(songId);
  const artistStrikes = new Map(station.artistStrikes);
  if (song) artistStrikes.set(artistOf(song), (artistStrikes.get(artistOf(song)) ?? 0) + 1);
  update({ disliked, artistStrikes });
}

/** Start a station; the first song is the seed itself for a song, otherwise the station's best pick. */
export async function startRadio(seed: RadioSeed): Promise<void> {
  try {
    const [{ songs, name }] = await Promise.all([seedSongs(seed), loadBans()]);
    if (!songs.length) {
      notify({ message: "nothing to start a radio from" });
      return;
    }
    station = {
      name: `${name} radio`,
      anchors: sample(songs, 20),
      liked: new Set(),
      disliked: new Set(),
      artistStrikes: new Map(),
      played: new Set(),
      variety: 0.5,
      eraLock: null,
      artistLock: null,
    };
    const first = seed.kind === "songs" && songs[0] ? [songs[0]] : [];
    const batch = pick(station, await candidates(station), AHEAD - first.length, bans);
    const start = [...first, ...batch.filter((song) => song.id !== first[0]?.id)];
    if (!start.length) {
      notify({ message: "couldn't find songs for that radio" });
      station = null;
      return;
    }
    for (const song of start) station.played.add(song.id);
    player.play(start, 0, { shuffle: false, source: { kind: SOURCE_KIND, name: station.name, href: "/" } });
    watching = { id: start[0]?.id ?? "", position: 0, duration: start[0]?.duration ?? 0 };
    watch();
    emit();
  } catch {
    notify({ kind: "error", message: "couldn't start the radio" });
  }
}

export function stopRadio(): void {
  unsubscribe?.();
  unsubscribe = null;
  clearInterval(ticker);
  watching = null;
  station = null;
  emit();
}

/** 👍: more like this song. */
export function moreLikeThis(song: Song): void {
  if (!station) return;
  update({ anchors: [...station.anchors, song], liked: new Set(station.liked).add(song.id) });
  notify({ message: `more like ${song.title}` });
}

/** 👎: not for this station; skips it if it's playing and keeps its artist away after two. */
export function notForThisStation(song: Song): void {
  if (!station) return;
  watching = null;
  const artistStrikes = new Map(station.artistStrikes);
  artistStrikes.set(artistOf(song), (artistStrikes.get(artistOf(song)) ?? 0) + 1);
  update({ disliked: new Set(station.disliked).add(song.id), artistStrikes });
  // Upcoming songs by an artist that's now out go too.
  const out = (artistStrikes.get(artistOf(song)) ?? 0) >= 2;
  const { queue } = player.getState();
  for (const entry of contextUpcoming(queue))
    if (entry.song.id === song.id || (out && artistOf(entry.song) === artistOf(song))) player.removeQuietly(entry);
  if (currentSong(player.getState())?.id === song.id) player.next();
  else void refill();
}

/** Never on any station, in any browser. */
export async function banFromRadio(song: Song): Promise<void> {
  bans.add(song.id);
  await fetch("/api/radio/bans", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ song }),
  }).catch(() => undefined);
  notify({ message: `${song.title} won't play on radio again` });
  if (station) notForThisStation(song);
}

export function setVariety(variety: number): void {
  update({ variety: Math.max(0, Math.min(1, variety)) });
}

/** Lock to this song's era (±5 years), or unlock. */
export function toggleEraLock(song: Song | undefined): void {
  if (!station) return;
  update({ eraLock: station.eraLock || !song?.year ? null : [song.year - 5, song.year + 5] });
}

/** Lock to this song's artist, or unlock. */
export function toggleArtistLock(song: Song | undefined): void {
  if (!station) return;
  update({ artistLock: station.artistLock || !song ? null : { id: song.artistId ?? "", name: song.artist ?? "" } });
}

/** Everything played and queued on this station, saved as a playlist. */
export async function saveStation(): Promise<void> {
  if (!station) return;
  const { queue } = player.getState();
  const songs = [
    ...queue.history.map((entry) => entry.song),
    ...(queue.current ? [queue.current.song] : []),
    ...contextUpcoming(queue).map((entry) => entry.song),
  ].filter((song) => station?.played.has(song.id));
  const { createPlaylist } = await import("./playlists");
  const name = `${station.name} · ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" }).toLowerCase()}`;
  if (await createPlaylist(name, { songs })) notify({ message: `saved ${name}` });
}

onAccountChange(() => {
  stopRadio();
  bans = new Set();
});
