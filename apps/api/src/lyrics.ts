import type { Database } from "bun:sqlite";
import { type Lyrics, MISSING } from "@lodesong/shared/lyrics";
import type { Upstream } from "./config";
import { parseLrc, parsePlain } from "./lrc";
import { createLyricsSearchTables, indexLyrics, unindexLyrics } from "./lyrics-search";
import { type Credentials, subsonic } from "./subsonic";

const DAY = 86_400_000;
/** A miss is asked again after this long: LRCLIB grows every day. */
const RETRY_MISSING_MS = 30 * DAY;
const USER_AGENT = "lodesong (https://github.com/FindMalek/lodesong)";

interface Song {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  albumId?: string;
  duration?: number;
  displayAlbumArtist?: string;
  path?: string;
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

export function mainArtist(artist: string): string {
  return artist.split(/\s+(?:feat\.?|ft\.?|featuring|&|x|vs\.?)\s+|,\s*|;\s*/i)[0]?.trim() ?? artist;
}

export function closestByDuration(records: LrclibRecord[], seconds: number): LrclibRecord | null {
  const usable = records.filter((record) => record.syncedLyrics || record.plainLyrics || record.instrumental);
  const best = usable.sort((a, b) => Math.abs(a.duration - seconds) - Math.abs(b.duration - seconds))[0];
  if (!best) return null;
  const gap = Math.abs(best.duration - seconds);
  if (gap <= 2) return best;
  return gap <= 5 && best.syncedLyrics ? best : null;
}

function fromLrclib(record: LrclibRecord): Lyrics {
  const lrclibId = record.id;
  if (record.syncedLyrics) {
    const { lines, offset } = parseLrc(record.syncedLyrics);
    if (lines.length) return { status: "synced", lines, offset, source: "lrclib", lrclibId };
  }
  if (record.plainLyrics) return { status: "plain", lines: parsePlain(record.plainLyrics), offset: 0, source: "lrclib", lrclibId };
  if (record.instrumental) return { status: "instrumental", lines: [], offset: 0, source: "lrclib", lrclibId };
  return MISSING;
}

interface StructuredLyrics {
  synced: boolean;
  lang?: string;
  offset?: number;
  line: { start?: number; value: string }[];
}

function align(main: { start: number }[], other: StructuredLyrics): string[] {
  if (!other.synced) return main.map((_, index) => other.line[index]?.value ?? "");
  return main.map((line) => {
    let best = "";
    let gap = Number.POSITIVE_INFINITY;
    for (const candidate of other.line) {
      const distance = Math.abs((candidate.start ?? 0) - line.start);
      if (distance < gap) {
        gap = distance;
        best = candidate.value;
      }
    }
    return gap <= 1500 ? best : "";
  });
}

export function fromNavidrome(list: StructuredLyrics[]): Lyrics | null {
  const pick = list.find((lyrics) => lyrics.synced && lyrics.line.length) ?? list.find((lyrics) => lyrics.line.length);
  if (!pick) return null;
  const others = list.filter((lyrics) => lyrics !== pick && lyrics.line.length && lyrics.lang && lyrics.lang !== pick.lang);
  const withTranslations = (lyrics: Lyrics): Lyrics =>
    others.length
      ? { ...lyrics, translations: others.map((other) => ({ lang: other.lang as string, lines: align(lyrics.lines, other) })) }
      : lyrics;
  if (!pick.synced)
    return withTranslations({
      status: "plain",
      lines: pick.line.map((line) => ({ start: 0, end: 0, text: line.value })),
      offset: 0,
      source: "navidrome",
    });
  const offset = pick.offset ?? 0;
  const lines = pick.line.map((line) => ({ start: Math.max(0, (line.start ?? 0) - offset), text: line.value }));
  return withTranslations({
    status: "synced",
    offset,
    source: "navidrome",
    lines: lines.map((line, index) => ({ ...line, end: lines[index + 1]?.start ?? line.start + 5000 })),
  });
}

export class LyricsService {
  onLrclib: ((upstreamId: string, song: { id: string; path?: string }, text: string) => void) | null = null;

  constructor(
    private readonly db: Database,
    private readonly lrclibUrl: string,
    private readonly now: () => number = Date.now,
  ) {
    createLyricsSearchTables(db);
  }

  /** Song ids are only unique per server, so the cache key carries the upstream. */
  cached(upstreamId: string, songId: string): (Lyrics & { fetched: number }) | null {
    const row = this.db
      .query<{ body: string; lrclib_id: number | null; fetched: number }, [string]>(
        "select body, lrclib_id, fetched from lyrics where song_id = ?",
      )
      .get(`${upstreamId}:${songId}`);
    return row ? { ...(JSON.parse(row.body) as Lyrics), fetched: row.fetched } : null;
  }

  private store(upstreamId: string, songId: string, lyrics: Lyrics, lrclibId: number | null): void {
    const key = `${upstreamId}:${songId}`;
    const rowid = this.db.query<{ rowid: number }, [string]>("select rowid from lyrics where song_id = ?");
    this.db.transaction(() => {
      // A replace gives the row a new rowid, so the search row goes with the old one.
      const old = rowid.get(key);
      if (old) unindexLyrics(this.db, old.rowid);
      this.db
        .query("insert or replace into lyrics (song_id, status, source, lrclib_id, body, fetched) values (?, ?, ?, ?, ?, ?)")
        .run(key, lyrics.status, lyrics.source, lrclibId, JSON.stringify(lyrics), this.now());
      const row = rowid.get(key);
      if (row) indexLyrics(this.db, row.rowid, lyrics);
    })();
  }

  async get(upstream: Upstream, credentials: Credentials, songId: string): Promise<Lyrics> {
    const cached = this.cached(upstream.id, songId);
    if (cached && (cached.status !== "missing" || this.now() - cached.fetched < RETRY_MISSING_MS)) {
      const { fetched: _at, ...lyrics } = cached;
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
    const text = found?.syncedLyrics || found?.plainLyrics;
    if (text) this.onLrclib?.(upstream.id, song, text);
    return lyrics;
  }

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
