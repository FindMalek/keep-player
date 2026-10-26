// The server stamps the host's state with its own clock, so listeners never trust two machines' clocks.

export interface ListenSong {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  albumId?: string;
  coverArt?: string;
  duration?: number;
}

export interface HostState {
  song: ListenSong | null;
  position: number;
  playing: boolean;
}

export type ClientMessage =
  | { t: "state"; state: HostState }
  | { t: "add"; song: ListenSong }
  | { t: "skip" }
  | { t: "toggle" }
  | { t: "setting"; anyoneCanSkip?: boolean; partyMode?: boolean }
  | { t: "end" };

export interface Member {
  user: string;
  host: boolean;
}

export type ServerMessage =
  | {
      t: "hello";
      code: string;
      role: "host" | "listener";
      anyoneCanSkip: boolean;
      partyMode: boolean;
      members: Member[];
      state: HostState | null;
      stamped: number;
      now: number;
    }
  | { t: "state"; state: HostState; stamped: number; now: number }
  | { t: "members"; members: Member[] }
  | { t: "setting"; anyoneCanSkip: boolean; partyMode: boolean }
  | { t: "add"; song: ListenSong; by: string }
  | { t: "skip"; by: string }
  | { t: "toggle"; by: string }
  | { t: "ended" };

export const MAX_MESSAGE_BYTES = 8192;
export const DRIFT_SECONDS = 0.25;

/** Where the host's playhead is now, on the listener's own clock. `offset` is server time − local time (ms). */
export function expectedPosition(state: HostState, stamped: number, offset: number, localNow: number): number {
  if (!state.playing) return state.position;
  return state.position + Math.max(0, localNow + offset - stamped) / 1000;
}

/** The server clock offset from one message: its `now` against the local time it arrived (includes the one-way delay). */
export const clockOffset = (serverNow: number, localNow: number): number => serverNow - localNow;

export type Correction = { kind: "none" } | { kind: "seek"; to: number };

export function correction(actual: number, expected: number): Correction {
  return Math.abs(actual - expected) > DRIFT_SECONDS ? { kind: "seek", to: Math.max(0, expected) } : { kind: "none" };
}

export const isSong = (value: unknown): value is ListenSong =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ListenSong).id === "string" &&
  typeof (value as ListenSong).title === "string";

export const clean = (song: ListenSong): ListenSong => ({
  id: song.id.slice(0, 200),
  title: song.title.slice(0, 300),
  ...(typeof song.artist === "string" ? { artist: song.artist.slice(0, 300) } : {}),
  ...(typeof song.album === "string" ? { album: song.album.slice(0, 300) } : {}),
  ...(typeof song.albumId === "string" ? { albumId: song.albumId.slice(0, 200) } : {}),
  ...(typeof song.coverArt === "string" ? { coverArt: song.coverArt.slice(0, 200) } : {}),
  ...(typeof song.duration === "number" && Number.isFinite(song.duration) ? { duration: song.duration } : {}),
});

export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const message = value as Record<string, unknown>;
  switch (message.t) {
    case "state": {
      const state = message.state as Partial<HostState> | undefined;
      if (!state || typeof state.position !== "number" || !Number.isFinite(state.position) || typeof state.playing !== "boolean")
        return null;
      if (state.song !== null && !isSong(state.song)) return null;
      return {
        t: "state",
        state: { song: state.song ? clean(state.song) : null, position: Math.max(0, state.position), playing: state.playing },
      };
    }
    case "add":
      return isSong(message.song) ? { t: "add", song: clean(message.song) } : null;
    case "skip":
      return { t: "skip" };
    case "toggle":
      return { t: "toggle" };
    case "setting": {
      const skip = typeof message.anyoneCanSkip === "boolean" ? message.anyoneCanSkip : undefined;
      const party = typeof message.partyMode === "boolean" ? message.partyMode : undefined;
      if (skip === undefined && party === undefined) return null;
      return { t: "setting", ...(skip !== undefined ? { anyoneCanSkip: skip } : {}), ...(party !== undefined ? { partyMode: party } : {}) };
    }
    case "end":
      return { t: "end" };
    default:
      return null;
  }
}
