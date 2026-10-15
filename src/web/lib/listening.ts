import { player } from "./player";
import { HEADERS } from "./subsonic";
import type { Song } from "./types";

/*
 * Listening history (#44): each song that played is recorded on the server when the next one starts or the tab goes
 * away, with the seconds you actually listened (counted while playing, so seeking ahead doesn't count) and whether
 * it ran to its end. Skips come from that: under 30 s and not finished (decided server-side).
 */

interface Listening {
  /** The queue entry, so the same song queued twice is two listens. */
  uid: string;
  song: Song;
  started: number;
  listened: number;
  lastPosition: number;
}

let now: Listening | null = null;

function snapshot(song: Song): Record<string, unknown> {
  const { id, title, artist, artistId, album, albumId, coverArt, duration, suffix, bitRate, year, track, discNumber } = song;
  return { id, title, artist, artistId, album, albumId, coverArt, duration, suffix, bitRate, year, track, discNumber };
}

function flush(keepalive = false): void {
  const done = now;
  now = null;
  if (!done || done.listened < 1) return;
  const finished = done.song.duration ? done.lastPosition >= done.song.duration - 3 : false;
  void fetch("/api/history", {
    method: "POST",
    keepalive,
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ song: snapshot(done.song), started: done.started, listened: done.listened, finished }),
  }).catch(() => undefined);
}

let started = false;

export function startListeningHistory(): void {
  if (started) return;
  started = true;
  setInterval(() => {
    if (!now || !player.getState().playing) return;
    now.listened += 1;
    now.lastPosition = player.getPosition();
  }, 1000);
  player.subscribe(() => {
    const entry = player.getState().queue.current;
    if (entry?.uid === now?.uid) return;
    flush();
    if (entry) now = { uid: entry.uid, song: entry.song, started: Date.now(), listened: 0, lastPosition: 0 };
  });
  window.addEventListener("pagehide", () => flush(true));
}
