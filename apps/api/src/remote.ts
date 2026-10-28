import type { Lyrics } from "@lodesong/shared/lyrics";

// The terminal's token is a session of its own, so the sessions list can sign it out.

export interface RemoteSong {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
}

export interface RemoteNow {
  song: RemoteSong | null;
  /** Seconds in; null when only Navidrome's now-playing knows the song (another app plays it). */
  position: number | null;
  playing: boolean;
  device: string | null;
  line: string | null;
  controllable: boolean;
}

export const NOTHING: RemoteNow = { song: null, position: null, playing: false, device: null, line: null, controllable: false };

export const remoteSong = (song: RemoteSong): RemoteSong => ({
  id: song.id,
  title: song.title,
  ...(song.artist ? { artist: song.artist } : {}),
  ...(song.album ? { album: song.album } : {}),
  ...(song.duration ? { duration: song.duration } : {}),
});

export function lineAt(lyrics: Lyrics, seconds: number, offsetMs = 0): string | null {
  if (lyrics.status !== "synced") return null;
  const at = seconds * 1000 + offsetMs;
  const line = lyrics.lines.findLast((candidate) => candidate.start <= at);
  return line && at < line.end && line.text.trim() ? line.text : null;
}

export type NowPlayingEntry = RemoteSong & { username?: string; playerName?: string; minutesAgo?: number };

/** From Navidrome's getNowPlaying: the user's most recent song, if it can still be playing. */
export function latestFor(entries: NowPlayingEntry[], user: string): NowPlayingEntry | null {
  const mine = entries
    .filter((entry) => entry.username === user)
    .filter((entry) => (entry.minutesAgo ?? 0) <= (entry.duration ?? 0) / 60 + 1)
    .sort((a, b) => (a.minutesAgo ?? 0) - (b.minutesAgo ?? 0));
  return mine[0] ?? null;
}
