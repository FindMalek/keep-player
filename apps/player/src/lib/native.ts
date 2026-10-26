import { isLiked, subscribeLikes, toggleLiked } from "./likes";
import { currentSong, player } from "./player";
import { queries, queryClient } from "./queries";
import * as Q from "./queue";
import { coverUrl, HEADERS } from "./subsonic";

/*
 * The bridge to the macOS app (apps/macos): inside its web view, what's playing goes to the native side (the notch,
 * the mini player, the menu bar) and its buttons come back here. Anywhere else this does nothing.
 */

interface NowPlaying {
  id: string | null;
  title: string | null;
  artist?: string;
  album?: string;
  /** A data URL: the native side has no session cookie to fetch covers with. */
  cover?: string;
  playing: boolean;
  liked: boolean;
  /** Seconds, as of `at` (ms since the epoch): the native side moves it on by itself. */
  position: number;
  at: number;
  duration: number;
}

type Handler = { postMessage(message: unknown): void };
const handler = () => (window as unknown as { webkit?: { messageHandlers?: { keep?: Handler } } }).webkit?.messageHandlers?.keep;

let lastCover: { id: string; data: string } | null = null;

async function coverData(id: string | undefined): Promise<string | undefined> {
  if (!id) return undefined;
  if (lastCover?.id === id) return lastCover.data;
  const url = coverUrl(id, 256);
  const response = url ? await fetch(url, { headers: HEADERS }).catch(() => null) : null;
  if (!response?.ok) return undefined;
  const blob = await response.blob();
  const data = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
  lastCover = { id, data };
  return data;
}

/** The next songs, for the notch's queue. */
function upcoming(limit = 25) {
  const { queue } = player.getState();
  return [...queue.upNext, ...Q.contextUpcoming(queue)].slice(0, limit).map((entry) => ({
    uid: entry.uid,
    title: entry.song.title,
    artist: entry.song.artist ?? "",
    duration: entry.song.duration ?? 0,
  }));
}

let started = false;

export function startNativeBridge(): void {
  const native = handler();
  if (!native || started) return;
  started = true;
  let sent = "";
  const post = async (force: boolean) => {
    const state = player.getState();
    const song = currentSong(state);
    const now: NowPlaying = song
      ? {
          id: song.id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          cover: await coverData(song.coverArt),
          playing: state.playing,
          liked: isLiked(song.id),
          position: player.getPosition(),
          at: Date.now(),
          duration: state.duration || song.duration || 0,
        }
      : { id: null, title: null, playing: false, liked: false, position: 0, at: Date.now(), duration: 0 };
    // Only what changes the picture; the playhead is re-sent on seeks and every 15 s, the native side moves it between.
    const key = `${now.id}|${now.playing}|${now.liked}|${now.duration}|${state.queue.upNext.length}|${state.queue.context.cursor}`;
    if (!force && key === sent) return;
    sent = key;
    native.postMessage(now);
  };
  player.subscribe(() => void post(false));
  subscribeLikes(() => void post(false));
  player.element().addEventListener("seeked", () => void post(true));
  setInterval(() => player.getState().playing && void post(true), 15_000);
  (window as unknown as { keepNative: unknown }).keepNative = {
    toggle: () => player.toggle(),
    next: () => player.next(),
    previous: () => player.previous(),
    seek: (seconds: number) => player.seek(seconds),
    like: () => {
      const song = currentSong(player.getState());
      if (song) void toggleLiked("song", song.id, song.title);
    },
    queue: () => upcoming(),
    jump: (uid: string) => {
      const { queue } = player.getState();
      const entry = [...queue.upNext, ...Q.contextUpcoming(queue)].find((item) => item.uid === uid);
      if (entry) player.jumpTo(entry);
    },
    /** The app shows bars (the island is up): send the music's levels ~15 times a second while a song plays. */
    levels: (on: boolean) => {
      player
        .levels(on ? (levels) => player.getState().playing && native.postMessage({ levels }) : null)
        .catch((error: unknown) => native.postMessage({ debug: `levels: ${error}` }));
    },
    /** Synced lines (ms) for the song playing, or plain ones with no times. */
    lyrics: async () => {
      const song = currentSong(player.getState());
      if (!song) return { status: "missing", lines: [] };
      const found = await queryClient.fetchQuery(queries.lyrics(song.id)).catch(() => null);
      return { status: found?.status ?? "missing", lines: (found?.lines ?? []).map((line) => ({ start: line.start, text: line.text })) };
    },
  };
  void post(true);
}
