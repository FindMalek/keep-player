import type { Database } from "bun:sqlite";
import { type Lyrics, MISSING } from "../shared/lyrics";
import type { Upstream } from "./config";
import { parseLrc, parsePlain } from "./lrc";
import { type Credentials, subsonic } from "./subsonic";

const DAY = 86_400_000;
/** A miss is asked again after this long: LRCLIB grows every day. */
const RETRY_MISSING_MS = 30 * DAY;
const USER_AGENT = "keep-player (https://github.com/FindMalek/keep-player)";

interface Song {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  albumId?: string;
  duration?: number;
  displayAlbumArtist?: string;
}

interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/**
 * Titles as LRCLIB knows them: no "(Remastered 2011)", "- Live", "feat. X", "[Explicit]" or similar, which tags add
 * and lyric databases don't.
 */
export function normalizeTitle(title: string): string {
  return title
    .replace(
      /\s*[([](?:[^)\]]*?\b(?:remaster(?:ed)?|deluxe|explicit|clean|mono|stereo|bonus|single|radio edit|edit|version|mix|live|demo|acoustic|feat\.?|ft\.?|with)\b[^)\]]*)[)\]]/gi,
      "",
    )
    .replace(/\s+-\s+(?:\d{4}\s+)?(?:remaster(?:ed)?|live|demo|acoustic|radio edit|mono|stereo|single version)\b.*$/i, "")
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** The main artist: "A feat. B", "A & B", "A, B" → "A". */
export function mainArtist(artist: string): string {
  return artist.split(/\s+(?:feat\.?|ft\.?|featuring|&|x|vs\.?)\s+|,\s*|;\s*/i)[0]?.trim() ?? artist;
}

/** Of LRCLIB search results, the one closest in length: within 2 s is a match, beyond 5 s never is. */
export function closestByDuration(records: LrclibRecord[], seconds: number): LrclibRecord | null {
  const usable = records.filter((record) => record.syncedLyrics || record.plainLyrics || record.instrumental);
  const best = usable.sort((a, b) => Math.abs(a.duration - seconds) - Math.abs(b.duration - seconds))[0];
  if (!best) return null;
  const gap = Math.abs(best.duration - seconds);
  if (gap <= 2) return best;
  return gap <= 5 && best.syncedLyrics ? best : null;
}

function fromLrclib(record: LrclibRecord): Lyrics {
  if (record.syncedLyrics) {
    const { lines, offset } = parseLrc(record.syncedLyrics);
    if (lines.length) return { status: "synced", lines, offset, source: "lrclib" };
  }
  if (record.plainLyrics) return { status: "plain", lines: parsePlain(record.plainLyrics), offset: 0, source: "lrclib" };
  if (record.instrumental) return { status: "instrumental", lines: [], offset: 0, source: "lrclib" };
  return MISSING;
}

interface StructuredLyrics {
  synced: boolean;
  lang?: string;
  offset?: number;
  line: { start?: number; value: string }[];
}

/** Navidrome's own lyrics (embedded or .lrc next to the file): synced first. */
function fromNavidrome(list: StructuredLyrics[]): Lyrics | null {
  const pick = list.find((lyrics) => lyrics.synced && lyrics.line.length) ?? list.find((lyrics) => lyrics.line.length);
  if (!pick) return null;
  if (!pick.synced)
    return { status: "plain", lines: pick.line.map((line) => ({ start: 0, end: 0, text: line.value })), offset: 0, source: "navidrome" };
  const offset = pick.offset ?? 0;
  const lines = pick.line.map((line) => ({ start: Math.max(0, (line.start ?? 0) - offset), text: line.value }));
  return {
    status: "synced",
    offset,
    source: "navidrome",
    lines: lines.map((line, index) => ({ ...line, end: lines[index + 1]?.start ?? line.start + 5000 })),
  };
}

export class LyricsService {
  constructor(
    private readonly db: Database,
    private readonly lrclibUrl: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** Song ids are only unique per server, so the cache key carries the upstream. */
  cached(upstreamId: string, songId: string): (Lyrics & { lrclibId: number | null; fetched: number }) | null {
    const row = this.db
      .query<{ body: string; lrclib_id: number | null; fetched: number }, [string]>(
        "select body, lrclib_id, fetched from lyrics where song_id = ?",
      )
      .get(`${upstreamId}:${songId}`);
    return row ? { ...(JSON.parse(row.body) as Lyrics), lrclibId: row.lrclib_id, fetched: row.fetched } : null;
  }

  private store(upstreamId: string, songId: string, lyrics: Lyrics, lrclibId: number | null): void {
    this.db
      .query("insert or replace into lyrics (song_id, status, source, lrclib_id, body, fetched) values (?, ?, ?, ?, ?, ?)")
      .run(`${upstreamId}:${songId}`, lyrics.status, lyrics.source, lrclibId, JSON.stringify(lyrics), this.now());
  }

  /** Cached, or resolved now (Navidrome → LRCLIB exact → LRCLIB search) and cached, hits and misses alike. */
  async get(upstream: Upstream, credentials: Credentials, songId: string): Promise<Lyrics> {
    const cached = this.cached(upstream.id, songId);
    if (cached && (cached.status !== "missing" || this.now() - cached.fetched < RETRY_MISSING_MS)) {
      const { lrclibId: _id, fetched: _at, ...lyrics } = cached;
      return lyrics;
    }
    const own = await subsonic<{ lyricsList?: { structuredLyrics?: StructuredLyrics[] } }>(upstream, credentials, "getLyricsBySongId", {
      id: songId,
    });
    const fromServer = fromNavidrome(own?.lyricsList?.structuredLyrics ?? []);
    if (fromServer) {
      this.store(upstream.id, songId, fromServer, null);
      return fromServer;
    }
    const song = (await subsonic<{ song: Song }>(upstream, credentials, "getSong", { id: songId }))?.song;
    // Unknown song or no network: don't cache, try again next time.
    if (!song) return MISSING;
    const found = await this.lookup(song).catch(() => undefined);
    if (found === undefined) return MISSING;
    const lyrics = found ? fromLrclib(found) : MISSING;
    this.store(upstream.id, songId, lyrics, found?.id ?? null);
    return lyrics;
  }

  /** LRCLIB: exact match with album and duration, then a search by normalized title and artist. Undefined = unreachable. */
  private async lookup(song: Song): Promise<LrclibRecord | null | undefined> {
    if (!this.lrclibUrl) return null;
    const title = normalizeTitle(song.title);
    const artists = [
      ...new Set([song.artist, song.displayAlbumArtist].filter((artist): artist is string => Boolean(artist)).map(mainArtist)),
    ];
    for (const artist of artists) {
      const exact = await this.fetchLrclib<LrclibRecord>("/api/get", {
        track_name: title,
        artist_name: artist,
        album_name: song.album ?? "",
        duration: String(Math.round(song.duration ?? 0)),
      });
      if (exact === undefined) return undefined;
      if (exact && (exact.syncedLyrics || exact.plainLyrics || exact.instrumental)) return exact;
      const results = await this.fetchLrclib<LrclibRecord[]>("/api/search", { track_name: title, artist_name: artist });
      if (results === undefined) return undefined;
      const close = closestByDuration(results ?? [], song.duration ?? 0);
      if (close) return close;
    }
    return null;
  }

  /** Null for "not found", undefined when LRCLIB is unreachable or rate limiting (so nothing gets cached). */
  private async fetchLrclib<T>(path: string, params: Record<string, string>): Promise<T | null | undefined> {
    const response = await fetch(`${this.lrclibUrl}${path}?${new URLSearchParams(params)}`, {
      headers: { "user-agent": USER_AGENT, "lrclib-client": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!response) return undefined;
    if (response.status === 404) return null;
    if (!response.ok) return undefined;
    return (await response.json().catch(() => null)) as T | null;
  }

  offset(user: string, songId: string): number {
    return (
      this.db
        .query<{ offset_ms: number }, [string, string]>("select offset_ms from lyric_offsets where user = ? and song_id = ?")
        .get(user, songId)?.offset_ms ?? 0
    );
  }

  setOffset(user: string, songId: string, offsetMs: number): void {
    if (offsetMs === 0) this.db.query("delete from lyric_offsets where user = ? and song_id = ?").run(user, songId);
    else
      this.db
        .query("insert or replace into lyric_offsets (user, song_id, offset_ms) values (?, ?, ?)")
        .run(user, songId, Math.round(offsetMs));
  }
}
