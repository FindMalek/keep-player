import { clean, isSong, type ListenSong } from "./listen";

/*
 * One playback session per account (#192), like Spotify Connect: every open player of yours joins it, one of them plays
 * and the rest are remotes showing the same queue. A device that starts playing takes over; the old one stops.
 */

/** A song as a device hands it on: what the bar shows, plus what playing it well needs. */
export interface DeviceSong extends ListenSong {
  artistId?: string;
  track?: number;
  discNumber?: number;
  suffix?: string;
  bitRate?: number;
  replayGain?: { trackGain?: number; albumGain?: number; trackPeak?: number; albumPeak?: number };
}

export interface DeviceState {
  /** The current song first, then what plays after it. */
  songs: DeviceSong[];
  /** Seconds into the current song when the state was sent. */
  position: number;
  playing: boolean;
}

export interface Device {
  id: string;
  name: string;
  active: boolean;
}

export type DeviceCommand =
  | { action: "toggle"; playing: boolean }
  | { action: "next" }
  | { action: "previous" }
  | { action: "seek"; to: number }
  | { action: "play"; songs: DeviceSong[]; start: number; shuffle: boolean; source?: { kind: string; name: string; href?: string } }
  | { action: "add"; songs: DeviceSong[]; next: boolean };

/** Client → server. A `state` that says playing, from a device that isn't the active one, makes it the active one. */
export type DeviceClientMessage =
  | { t: "state"; state: DeviceState }
  | { t: "command"; command: DeviceCommand }
  | { t: "transfer"; to: string };

/** Server → client. `now` is the server clock in ms when the message was sent. */
export type DeviceServerMessage =
  | { t: "devices"; devices: Device[] }
  | { t: "state"; state: DeviceState; stamped: number; now: number }
  | { t: "command"; command: DeviceCommand }
  /** Play here from this state (null: nothing played yet). */
  | { t: "take"; state: DeviceState | null; stamped: number; now: number }
  /** Another device took over: stop. */
  | { t: "yield" };

/** A queue is relayed this far ahead; a play command (a whole playlist) up to `MAX_PLAY_SONGS`. */
export const MAX_STATE_SONGS = 100;
export const MAX_PLAY_SONGS = 500;
export const MAX_DEVICE_MESSAGE_BYTES = 256 * 1024;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function cleanSong(song: DeviceSong): DeviceSong {
  const gain = song.replayGain;
  return {
    ...clean(song),
    ...(typeof song.artistId === "string" ? { artistId: song.artistId.slice(0, 200) } : {}),
    ...(finite(song.track) ? { track: song.track } : {}),
    ...(finite(song.discNumber) ? { discNumber: song.discNumber } : {}),
    ...(typeof song.suffix === "string" ? { suffix: song.suffix.slice(0, 20) } : {}),
    ...(finite(song.bitRate) ? { bitRate: song.bitRate } : {}),
    ...(typeof gain === "object" && gain !== null
      ? {
          replayGain: Object.fromEntries(
            (["trackGain", "albumGain", "trackPeak", "albumPeak"] as const)
              .filter((key) => finite(gain[key]))
              .map((key) => [key, gain[key]]),
          ),
        }
      : {}),
  };
}

function songs(value: unknown, max: number): DeviceSong[] | null {
  if (!Array.isArray(value) || value.length > max || !value.every(isSong)) return null;
  return value.map(cleanSong);
}

function command(value: unknown): DeviceCommand | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  switch (c.action) {
    case "toggle":
      return typeof c.playing === "boolean" ? { action: "toggle", playing: c.playing } : null;
    case "next":
    case "previous":
      return { action: c.action };
    case "seek":
      return finite(c.to) ? { action: "seek", to: Math.max(0, c.to) } : null;
    case "play": {
      const list = songs(c.songs, MAX_PLAY_SONGS);
      if (!list?.length || !finite(c.start)) return null;
      const source = c.source as Record<string, unknown> | undefined;
      const named = typeof source?.kind === "string" && typeof source.name === "string";
      return {
        action: "play",
        songs: list,
        start: Math.min(list.length - 1, Math.max(0, Math.floor(c.start))),
        shuffle: c.shuffle === true,
        ...(named
          ? {
              source: {
                kind: (source.kind as string).slice(0, 40),
                name: (source.name as string).slice(0, 300),
                ...(typeof source.href === "string" ? { href: source.href.slice(0, 300) } : {}),
              },
            }
          : {}),
      };
    }
    case "add": {
      const list = songs(c.songs, MAX_PLAY_SONGS);
      return list?.length ? { action: "add", songs: list, next: c.next === true } : null;
    }
    default:
      return null;
  }
}

/** Parse what a device sent; null for anything malformed or oversized. */
export function parseDeviceMessage(raw: string): DeviceClientMessage | null {
  if (raw.length > MAX_DEVICE_MESSAGE_BYTES) return null;
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
      const state = message.state as Record<string, unknown> | undefined;
      const list = songs(state?.songs, MAX_STATE_SONGS);
      if (!list || !finite(state?.position) || typeof state.playing !== "boolean") return null;
      return { t: "state", state: { songs: list, position: Math.max(0, state.position), playing: state.playing } };
    }
    case "command": {
      const parsed = command(message.command);
      return parsed ? { t: "command", command: parsed } : null;
    }
    case "transfer":
      return typeof message.to === "string" && message.to.length <= 64 ? { t: "transfer", to: message.to } : null;
    default:
      return null;
  }
}
