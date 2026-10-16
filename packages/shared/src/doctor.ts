import { normalize } from "./normalize";

/*
 * The library doctor (#64): checks over the search index's songs and albums. Pure, so the server runs it on whatever
 * the index holds and the tests run it on a handful of objects. Lyrics are not here: the lyrics page already has them.
 */

export interface DoctorSong {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  albumId?: string;
  duration?: number;
  suffix?: string;
  bitRate?: number;
  musicBrainzId?: string;
  replayGain?: { trackGain?: number; albumGain?: number };
}

export interface DoctorAlbum {
  id: string;
  name: string;
  artist?: string;
  artistId?: string;
  year?: number;
  coverArt?: string;
  songCount?: number;
}

export type CheckId = "no-cover" | "no-replaygain" | "no-musicbrainz" | "split-albums" | "duplicates" | "unusual-formats";

export interface Finding {
  /** What to show: "Artist – Title" or an album name. */
  label: string;
  /** Extra context (the other copy, the format…). */
  detail?: string;
  /** Where the item opens: a song id, album id. */
  songId?: string;
  albumId?: string;
}

export interface Check {
  id: CheckId;
  title: string;
  /** What it means and how to fix it, with the command when there is one. */
  hint: string;
  count: number;
  /** How many items the check looked at, for the health score. */
  of: number;
  /** The first `LIST_LIMIT` findings. */
  findings: Finding[];
}

export interface DoctorReport {
  checks: Check[];
  /** 0..100: the share of checked items that are fine, weighted evenly across checks. */
  health: number;
}

export const LIST_LIMIT = 100;
const DUPLICATE_GAP = 2;
const COMMON_SUFFIXES = new Set(["mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "alac", "aiff", "wma"]);
const LOSSY_FLOOR = 128;

const label = (song: DoctorSong) => [song.artist, song.title].filter(Boolean).join(" – ");

function make(id: CheckId, title: string, hint: string, of: number, all: Finding[]): Check {
  return { id, title, hint, count: all.length, of, findings: all.slice(0, LIST_LIMIT) };
}

/** Songs with the same normalized artist and title whose lengths are within 2 s: probably the same file twice. */
export function duplicates(songs: DoctorSong[]): Finding[] {
  const groups = new Map<string, DoctorSong[]>();
  for (const song of songs) {
    const key = `${normalize(song.artist ?? "")}|${normalize(song.title)}`;
    if (key === "|") continue;
    groups.set(key, [...(groups.get(key) ?? []), song]);
  }
  const found: Finding[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0));
    let cluster: DoctorSong[] = [];
    const flush = () => {
      const [first, ...rest] = cluster;
      if (first && rest.length)
        found.push({
          label: label(first),
          detail: cluster.map((song) => song.album ?? "no album").join(" · "),
          songId: first.id,
        });
      cluster = [];
    };
    for (const song of sorted) {
      const last = cluster[cluster.length - 1];
      if (last && Math.abs((song.duration ?? 0) - (last.duration ?? 0)) > DUPLICATE_GAP) flush();
      cluster.push(song);
    }
    flush();
  }
  return found.sort((a, b) => a.label.localeCompare(b.label));
}

/** The same album name and year filed under different artists: a split album (a feat. credit, a typo, a tag mismatch). */
export function splitAlbums(albums: DoctorAlbum[]): Finding[] {
  const groups = new Map<string, DoctorAlbum[]>();
  for (const album of albums) {
    const name = normalize(album.name);
    if (!name) continue;
    const key = `${name}|${album.year ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), album]);
  }
  const found: Finding[] = [];
  for (const group of groups.values()) {
    const artists = new Set(group.map((album) => album.artistId ?? album.artist ?? ""));
    if (group.length < 2 || artists.size < 2) continue;
    // "Various Artists" compilations legitimately share a name across labels; only look at ones that share a first word of the artist.
    const firsts = new Set(group.map((album) => normalize(album.artist ?? "").split(" ")[0]));
    if (firsts.size === group.length) continue;
    const [first] = group;
    if (!first) continue;
    found.push({
      label: first.name,
      detail: group.map((album) => album.artist ?? "unknown").join(" · "),
      albumId: first.id,
    });
  }
  return found.sort((a, b) => a.label.localeCompare(b.label));
}

export function unusualFormats(songs: DoctorSong[]): Finding[] {
  const found: Finding[] = [];
  for (const song of songs) {
    const suffix = (song.suffix ?? "").toLowerCase();
    const lossyLow = song.bitRate !== undefined && song.bitRate > 0 && song.bitRate < LOSSY_FLOOR && suffix !== "flac" && suffix !== "wav";
    if (suffix && !COMMON_SUFFIXES.has(suffix)) found.push({ label: label(song), detail: suffix, songId: song.id });
    else if (lossyLow) found.push({ label: label(song), detail: `${suffix || "?"} ${song.bitRate} kbps`, songId: song.id });
  }
  return found;
}

export function runChecks(songs: DoctorSong[], albums: DoctorAlbum[]): DoctorReport {
  const noCover = albums
    .filter((album) => !album.coverArt)
    .map((album): Finding => ({ label: album.name, detail: album.artist, albumId: album.id }));
  const noGain = songs
    .filter((song) => song.replayGain?.trackGain === undefined && song.replayGain?.albumGain === undefined)
    .map((song): Finding => ({ label: label(song), detail: song.album, songId: song.id }));
  const noMbid = songs
    .filter((song) => !song.musicBrainzId)
    .map((song): Finding => ({ label: label(song), detail: song.album, songId: song.id }));
  const checks = [
    make(
      "no-cover",
      "albums without a cover",
      "put cover.jpg in the album folder, or embed art: `beet fetchart` and `beet embedart`",
      albums.length,
      noCover,
    ),
    make(
      "no-replaygain",
      "songs without replaygain",
      "volume normalization can't apply to these: `beet replaygain` (or `rsgain easy` on the folder)",
      songs.length,
      noGain,
    ),
    make(
      "no-musicbrainz",
      "songs without a musicbrainz id",
      "tag them with MusicBrainz Picard, or `beet import` to match releases",
      songs.length,
      noMbid,
    ),
    make(
      "split-albums",
      "albums split across artists",
      "set one album artist on every track of the release (`beet modify albumartist=…`)",
      albums.length,
      splitAlbums(albums),
    ),
    make(
      "duplicates",
      "likely duplicates",
      "the same artist and title within 2 s of each other: keep one (`beet duplicates`)",
      songs.length,
      duplicates(songs),
    ),
    make(
      "unusual-formats",
      "unusual formats",
      "uncommon containers, or lossy files under 128 kbps: re-rip or replace",
      songs.length,
      unusualFormats(songs),
    ),
  ];
  const scored = checks.filter((check) => check.of > 0);
  const health = scored.length
    ? Math.round((scored.reduce((sum, check) => sum + (1 - check.count / check.of), 0) / scored.length) * 100)
    : 100;
  return { checks, health: Math.max(0, Math.min(100, health)) };
}
