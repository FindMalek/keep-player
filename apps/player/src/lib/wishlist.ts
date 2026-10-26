import { notify } from "./notify";
import { player } from "./player";
import { HEADERS } from "./subsonic";
import type { Song } from "./types";

export interface WishPreview {
  title: string;
  artists: string[];
  durationMs: number;
  source: "youtube" | "soundcloud" | "deezer" | "search";
  cover: string | null;
}

export interface WishState {
  status: "working" | "placed" | "review" | "missing" | "gone";
  stage: string;
}

/** Where the work is, in the order lyterion goes through it. */
export const WISH_STEPS = [
  { stages: ["queued", "searching"], label: "finding a good copy" },
  { stages: ["fetching"], label: "downloading" },
  { stages: ["verifying"], label: "checking it" },
  { stages: ["placed"], label: "in your library" },
] as const;

/** 0-based index of the step a stage belongs to (-1 before anything started). */
export function stepOf(stage: string): number {
  return WISH_STEPS.findIndex((step) => (step.stages as readonly string[]).includes(stage));
}

export const SOURCE_LABEL: Record<WishPreview["source"], string> = {
  youtube: "youtube link",
  soundcloud: "soundcloud link",
  deezer: "deezer link",
  search: "best match on youtube",
};

/** A pasted address rather than a song name. */
export function isLink(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

async function call<T>(step: "preview" | "add" | "status", body: object): Promise<T> {
  const response = await fetch(`/api/wishlist/${step}`, {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const answer = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !answer) throw new Error(answer?.error ?? "couldn't reach lyterion, try again");
  return answer;
}

export const wishlist = {
  preview: (input: string) => call<WishPreview>("preview", { input }),
  add: (input: string) => call<{ recordingId: string; meta: WishPreview }>("add", { input }),
  status: (recordingId: string) => call<WishState>("status", { recordingId }),
};

/** The song once Navidrome has scanned it in, matched the way the search index would. */
export async function findAdded(meta: Pick<WishPreview, "title" | "artists">): Promise<Song | null> {
  const query = `${meta.artists[0] ?? ""} ${meta.title}`.trim();
  const response = await fetch(`/api/search?${new URLSearchParams({ q: query, limit: "5" })}`, { headers: HEADERS });
  if (!response.ok) return null;
  const { songs } = (await response.json()) as { songs: Song[] };
  const wanted = meta.title.toLowerCase();
  return songs.find((song) => song.title.toLowerCase() === wanted) ?? null;
}

const POLL_MS = 3000;
const GIVE_UP_MS = 30 * 60_000;

/**
 * Keeps watching after the panel is closed: a toast when the song lands (with play) or when no good copy was found.
 * Lyterion works through one song at a time, so this stays a single light poll.
 */
export function followAdded(recordingId: string, meta: WishPreview): void {
  const started = Date.now();
  const name = meta.artists[0] ? `${meta.artists[0]} – ${meta.title}` : meta.title;
  const tick = async (): Promise<void> => {
    const state = await wishlist.status(recordingId).catch(() => null);
    if (state?.status === "working" || (!state && Date.now() - started < GIVE_UP_MS)) {
      if (Date.now() - started < GIVE_UP_MS) setTimeout(tick, POLL_MS);
      return;
    }
    if (state?.status === "placed") {
      const song = await waitForSong(meta);
      notify({
        message: `${name} is in your library`,
        action: song ? { label: "play", onClick: () => player.play([song], 0) } : undefined,
      });
    } else if (state?.status === "review") notify({ message: `${name} needs a look in lyterion's review queue` });
    else if (state) notify({ kind: "error", message: `no good copy of ${name} found` });
  };
  setTimeout(tick, POLL_MS);
}

/** Navidrome scans a few seconds after lyterion places the file. */
export async function waitForSong(meta: Pick<WishPreview, "title" | "artists">, tries = 12): Promise<Song | null> {
  for (let attempt = 0; attempt < tries; attempt++) {
    const song = await findAdded(meta).catch(() => null);
    if (song) return song;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return null;
}
