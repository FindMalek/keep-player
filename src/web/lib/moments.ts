import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Moment } from "../../shared/moments";
import { clock } from "./format";
import { notify } from "./notify";
import { currentSong, player } from "./player";
import { queryClient } from "./queries";
import { HEADERS } from "./subsonic";
import type { Song } from "./types";
import { done } from "./undo";

/*
 * Moments (#61): `b` saves where you are in a song, as many per song as you like, with an optional note. They show
 * as ticks on the seek bar, on the moments page, in search (`moment:`), and play back as a highlight reel.
 */

export const momentsQuery = () =>
  queryOptions({
    queryKey: ["moments"],
    queryFn: async (): Promise<Moment[]> => {
      const response = await fetch("/api/moments", { headers: HEADERS });
      if (!response.ok) throw new Error(`moments: ${response.status}`);
      return ((await response.json()) as { moments: Moment[] }).moments;
    },
    staleTime: 60_000,
  });

const EMPTY: Moment[] = [];

/** One song's moments, in time order, from the full list (one request for every tick on every song). */
export function useSongMoments(songId: string | undefined): Moment[] {
  const { data } = useQuery({ ...momentsQuery(), enabled: Boolean(songId) });
  if (!songId || !data) return EMPTY;
  return data.filter((moment) => moment.song.id === songId).sort((a, b) => a.at - b.at);
}

const setCached = (update: (moments: Moment[]) => Moment[]) =>
  queryClient.setQueryData(momentsQuery().queryKey, (current: Moment[] | undefined) => update(current ?? []));

async function post(song: Song, at: number, note: string): Promise<Moment> {
  const response = await fetch("/api/moments", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ song, at, note }),
  });
  if (!response.ok) throw new Error(`moment: ${response.status}`);
  const moment = (await response.json()) as Moment;
  setCached((moments) => [moment, ...moments]);
  return moment;
}

export async function deleteMoment(id: number): Promise<void> {
  setCached((moments) => moments.filter((moment) => moment.id !== id));
  await fetch(`/api/moments/${id}`, { method: "DELETE", headers: HEADERS });
}

export async function setMomentNote(id: number, note: string): Promise<void> {
  setCached((moments) => moments.map((moment) => (moment.id === id ? { ...moment, note } : moment)));
  await fetch(`/api/moments/${id}`, {
    method: "PATCH",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ note }),
  });
}

/** `b`: a moment where the current song is now; undoable. */
export async function saveMoment(note = ""): Promise<void> {
  const song = currentSong(player.getState());
  if (!song) return;
  const at = player.getPosition();
  try {
    let saved = await post(song, at, note);
    done({
      label: `saved a moment at ${clock(at)} in ${song.title}`,
      undo: () => deleteMoment(saved.id),
      redo: async () => {
        saved = await post(song, at, saved.note);
      },
    });
  } catch {
    notify({ kind: "error", message: "couldn't save the moment" });
  }
}

/** A link that opens this song at this point: `/song/:id?t=151`. */
export function momentLink(songId: string, at: number): string {
  return `${location.origin}/song/${encodeURIComponent(songId)}${at >= 1 ? `?t=${Math.floor(at)}` : ""}`;
}

/** `⇧C`: copy a link to the current song at the current time. */
export async function copyCurrentLink(): Promise<void> {
  const song = currentSong(player.getState());
  if (!song) return;
  const at = player.getPosition();
  try {
    await navigator.clipboard.writeText(momentLink(song.id, at));
    notify({ message: `copied a link to ${song.title} at ${clock(at)}` });
  } catch {
    notify({ kind: "error", message: "couldn't copy the link" });
  }
}

/*
 * The highlight reel: each moment plays for SNIPPET seconds, then the next one starts. Anything you do that changes the
 * song (next, picking something else) ends the reel.
 */
const SNIPPET = 30;
let reel: { moments: Moment[]; index: number; stop: () => void } | null = null;

function playSnippet(): void {
  const current = reel?.moments[reel.index];
  if (!reel || !current) {
    stopReel();
    return;
  }
  player.play([current.song as unknown as Song], 0, {
    startAt: current.at,
    source: { kind: "moments", name: "your moments", href: "/moments" },
  });
}

export function stopReel(): void {
  reel?.stop();
  reel = null;
}

function nextSnippet(): void {
  if (!reel) return;
  reel.index += 1;
  if (reel.index < reel.moments.length) playSnippet();
  else {
    player.toggle(false);
    stopReel();
  }
}

export function playReel(moments: Moment[]): void {
  stopReel();
  if (!moments.length) return;
  const unsubscribe = player.subscribe(() => {
    const current = reel?.moments[reel.index];
    if (!current) return;
    const playing = currentSong(player.getState());
    // A moment near the end: the song finished before its 30 s did.
    if (!playing) nextSnippet();
    // You chose something else: the reel is over.
    else if (playing.id !== current.song.id) stopReel();
  });
  const timer = setInterval(() => {
    const current = reel?.moments[reel.index];
    if (current && player.getPosition() >= current.at + SNIPPET) nextSnippet();
  }, 250);
  reel = {
    moments,
    index: 0,
    stop: () => {
      unsubscribe();
      clearInterval(timer);
    },
  };
  playSnippet();
}
