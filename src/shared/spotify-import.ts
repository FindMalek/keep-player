/*
 * Reading a Spotify export (#48): the files Spotify's "download your data" gives (`Playlist1.json`, `YourLibrary.json`),
 * and a plain shape of our own. Everything is turned into the same lists of tracks to match against the library.
 */

export interface ImportTrack {
  title: string;
  artist: string;
  album?: string;
  /** Milliseconds, when the export knows it. */
  durationMs?: number;
  isrc?: string;
}

export interface ImportList {
  name: string;
  tracks: ImportTrack[];
}

export interface ImportSet {
  playlists: ImportList[];
  liked: ImportTrack[];
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** A track from any of the shapes we read; null when it has no title or no artist (podcasts, local files). */
export function readTrack(raw: unknown): ImportTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const artists = Array.isArray(item.artists)
    ? item.artists.map((artist) => (typeof artist === "string" ? artist : text((artist as { name?: unknown })?.name))).filter(Boolean)
    : [];
  const title = text(item.trackName) || text(item.title) || text(item.track) || text(item.name);
  const artist = text(item.artistName) || text(item.artist) || artists[0] || "";
  if (!title || !artist) return null;
  const album = text(item.albumName) || text(item.album) || text((item.album as { name?: unknown } | undefined)?.name) || undefined;
  const duration = Number(item.duration_ms ?? item.durationMs ?? item.duration_ms);
  const isrc = text(item.isrc) || text((item.external_ids as { isrc?: unknown } | undefined)?.isrc) || undefined;
  return { title, artist, ...(album ? { album } : {}), ...(duration > 0 ? { durationMs: duration } : {}), ...(isrc ? { isrc } : {}) };
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Merge the parsed files of an export (any mix of playlist files, library files and our own shape) into one set. */
export function parseExport(files: unknown[]): ImportSet {
  const set: ImportSet = { playlists: [], liked: [] };
  for (const file of files) {
    if (!file || typeof file !== "object") continue;
    const body = file as Record<string, unknown>;
    // Playlist1.json: { playlists: [{ name, items: [{ track: { trackName, artistName, albumName } }] }] }
    for (const playlist of list(body.playlists)) {
      const entry = playlist as Record<string, unknown>;
      const name = text(entry.name);
      const tracks = [
        ...list(entry.items).map((item) => readTrack((item as { track?: unknown })?.track)),
        ...list(entry.tracks).map(readTrack),
      ];
      const read = tracks.filter((track): track is ImportTrack => track !== null);
      if (name && read.length) set.playlists.push({ name, tracks: read });
    }
    // YourLibrary.json: { tracks: [{ artist, album, track }] }; our own shape: { liked: [...] }
    for (const track of [...list(body.tracks), ...list(body.liked)]) {
      const read = readTrack(track);
      if (read) set.liked.push(read);
    }
  }
  return set;
}

/** The same song listed twice (a playlist that repeats it) once. */
export function dedupe(tracks: ImportTrack[]): ImportTrack[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    const key = `${track.title}\u0000${track.artist}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const csvCell = (value: string | number | undefined): string => {
  const cell = String(value ?? "");
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
};

/** The tracks nothing matched, as CSV for whatever fetches music (beets, Lidarr, a person with a list). */
export function missingCsv(tracks: ImportTrack[]): string {
  const rows = tracks.map((track) => [track.artist, track.title, track.album, track.isrc].map(csvCell).join(","));
  return `${["artist", "title", "album", "isrc"].join(",")}\n${rows.join("\n")}\n`;
}
