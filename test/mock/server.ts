import { createHash } from "node:crypto";
import type { Album, Song } from "../../src/web/lib/types";
import { createLibrary } from "./library";
import { greyPng } from "./png";

/**
 * A small Subsonic/OpenSubsonic server over a seeded library, for e2e tests and perf budgets.
 * Login: demo / demo. Audio is generated silence, so streams are cheap and seekable.
 */
const PORT = Number(process.env.MOCK_PORT ?? 4599);
const USER = "demo";
const PASSWORD = "demo";
const library = createLibrary(Number(process.env.MOCK_TRACKS ?? 10_000));
const albumsById = new Map(library.albums.map((album) => [album.id, album]));
const songsById = new Map(library.songs.map((song) => [song.id, song]));
const starred = new Map<string, string>();
const ratings = new Map<string, number>();
let playQueue: { entry: Song[]; current?: string; position?: number; changed?: string; changedBy?: string } | null = null;

type Params = URLSearchParams;
type Payload = Record<string, unknown>;

function ok(payload: Payload = {}): Response {
  return Response.json({
    "subsonic-response": { status: "ok", version: "1.16.1", type: "navidrome", serverVersion: "0.64.2", openSubsonic: true, ...payload },
  });
}

function fail(code: number, message: string): Response {
  return Response.json({ "subsonic-response": { status: "failed", version: "1.16.1", error: { code, message } } });
}

function authorized(params: Params): boolean {
  const salt = params.get("s") ?? "";
  const token = createHash("md5")
    .update(PASSWORD + salt)
    .digest("hex");
  return params.get("u") === USER && params.get("t") === token;
}

function withStar<T extends { id: string }>(item: T): T {
  const time = starred.get(item.id);
  const rating = ratings.get(item.id);
  return { ...item, ...(time ? { starred: time } : {}), ...(rating ? { userRating: rating } : {}) };
}

function summary(album: Album): Album {
  const { song: _songs, ...rest } = album;
  return withStar(rest);
}

function page<T>(items: T[], params: Params, sizeKey = "size", offsetKey = "offset", fallback = 10): T[] {
  const size = Math.min(Number(params.get(sizeKey) ?? fallback), 500);
  const offset = Number(params.get(offsetKey) ?? 0);
  return items.slice(offset, offset + size);
}

function albumList(params: Params): Album[] {
  const albums = [...library.albums];
  switch (params.get("type")) {
    case "newest":
      return albums.reverse();
    case "frequent":
    case "highest":
      return albums.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
    case "recent":
      return albums.filter((album) => (album.playCount ?? 0) > 25);
    case "random":
      return albums.sort(() => Math.random() - 0.5);
    case "alphabeticalByArtist":
      return albums.sort((a, b) => (a.artist ?? "").localeCompare(b.artist ?? ""));
    case "byYear":
      return albums.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    case "byGenre":
      return albums.filter((album) => album.genre === params.get("genre"));
    case "starred":
      return albums.filter((album) => starred.has(album.id));
    default:
      return albums.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function search(params: Params): Payload {
  const query = (params.get("query") ?? "").replace(/"/g, "").toLowerCase();
  const match = (text?: string) => !query || (text ?? "").toLowerCase().includes(query);
  return {
    searchResult3: {
      artist: page(
        library.artists.filter((artist) => match(artist.name)).map(({ album: _albums, ...artist }) => artist),
        params,
        "artistCount",
        "artistOffset",
        20,
      ),
      album: page(library.albums.filter((album) => match(album.name)).map(summary), params, "albumCount", "albumOffset", 20),
      song: page(library.songs.filter((song) => match(song.title)).map(withStar), params, "songCount", "songOffset", 20),
    },
  };
}

function directory(id: string): Payload | null {
  const artist = library.artists.find((item) => item.id === id);
  if (artist)
    return {
      directory: {
        id,
        name: artist.name,
        child: artist.album?.map((album) => ({ ...summary(album), title: album.name, isDir: true, parent: id })),
      },
    };
  const album = albumsById.get(id);
  if (album)
    return {
      directory: {
        id,
        name: album.name,
        parent: album.artistId,
        child: album.song?.map((song) => ({ ...song, isDir: false, parent: id })),
      },
    };
  return null;
}

/** 8 kHz 8-bit mono silence: about 8 KB per second, seekable with Range. */
function wav(seconds: number): Uint8Array<ArrayBuffer> {
  const rate = 8000;
  const data = rate * seconds;
  const bytes = new Uint8Array(44 + data).fill(128, 44);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + data, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, data, true);
  return bytes;
}

function stream(song: Song, request: Request): Response {
  const body = wav(song.duration ?? 180);
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (!range || (!range[1] && !range[2])) return new Response(body, { headers: { "content-type": "audio/wav", "accept-ranges": "bytes" } });
  // "bytes=-500" is a suffix range: the last 500 bytes.
  const start = range[1] ? Number(range[1]) : Math.max(body.length - Number(range[2]), 0);
  const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
  if (start >= body.length || start > end)
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${body.length}` } });
  return new Response(body.subarray(start, end + 1), {
    status: 206,
    headers: { "content-type": "audio/wav", "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${body.length}` },
  });
}

function cover(id: string, size: number): Response {
  const shade = 24 + ([...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 40);
  return new Response(greyPng(Math.min(Math.max(size || 300, 16), 512), shade), { headers: { "content-type": "image/png" } });
}

function handle(endpoint: string, params: Params, request: Request): Response {
  const id = params.get("id") ?? "";
  switch (endpoint) {
    case "ping":
    case "scrobble":
      return ok();
    case "getScanStatus":
      return ok({ scanStatus: { scanning: false, count: library.songs.length, lastScan: "2026-10-01T00:00:00Z" } });
    case "getMusicFolders":
      return ok({ musicFolders: { musicFolder: [{ id: 1, name: "music" }] } });
    case "getUser":
      return ok({ user: { username: params.get("username"), adminRole: params.get("username") === USER, folder: [1] } });
    case "getLicense":
      return ok({ license: { valid: true } });
    case "getOpenSubsonicExtensions":
      return ok({
        openSubsonicExtensions: [
          { name: "songLyrics", versions: [1] },
          { name: "indexBasedQueue", versions: [1] },
        ],
      });
    case "getAlbumList2":
      return ok({ albumList2: { album: page(albumList(params), params).map(summary) } });
    case "getAlbum": {
      const album = albumsById.get(id);
      return album ? ok({ album: { ...withStar(album), song: album.song?.map(withStar) } }) : fail(70, "album not found");
    }
    case "getSong": {
      const song = songsById.get(id);
      return song ? ok({ song: withStar(song) }) : fail(70, "song not found");
    }
    case "getArtists": {
      const groups = new Map<string, unknown[]>();
      for (const { album: _albums, ...artist } of library.artists) {
        const letter = artist.name[0]?.toUpperCase() ?? "#";
        groups.set(letter, [...(groups.get(letter) ?? []), withStar(artist)]);
      }
      return ok({ artists: { index: [...groups].sort().map(([name, artist]) => ({ name, artist })) } });
    }
    case "getArtist": {
      const artist = library.artists.find((item) => item.id === id);
      return artist ? ok({ artist: { ...withStar(artist), album: artist.album?.map(summary) } }) : fail(70, "artist not found");
    }
    case "getArtistInfo2":
      return ok({
        artistInfo2: { biography: "A fixture artist.", similarArtist: library.artists.slice(0, 5).map(({ album: _a, ...a }) => a) },
      });
    case "getTopSongs":
      return ok({
        topSongs: {
          song: library.songs.filter((song) => song.artist === params.get("artist")).slice(0, Number(params.get("count") ?? 10)),
        },
      });
    case "getSimilarSongs2":
      return ok({ similarSongs2: { song: library.songs.slice(0, Number(params.get("count") ?? 50)) } });
    case "getRandomSongs":
      return ok({ randomSongs: { song: [...library.songs].sort(() => Math.random() - 0.5).slice(0, Number(params.get("size") ?? 10)) } });
    case "getGenres":
      return ok({
        genres: {
          genre: library.genres.map((value) => ({
            value,
            songCount: library.songs.filter((song) => song.genre === value).length,
            albumCount: library.albums.filter((album) => album.genre === value).length,
          })),
        },
      });
    case "getSongsByGenre":
      return ok({
        songsByGenre: {
          song: page(
            library.songs.filter((song) => song.genre === params.get("genre")),
            params,
            "count",
          ),
        },
      });
    case "search3":
      return ok(search(params));
    case "getIndexes": {
      const artists = library.artists.map(({ id: artistId, name }) => ({ id: artistId, name }));
      return ok({ indexes: { index: [{ name: "#", artist: artists }] } });
    }
    case "getMusicDirectory": {
      const result = directory(id);
      return result ? ok(result) : fail(70, "directory not found");
    }
    case "getPlaylists":
      return ok({ playlists: { playlist: library.playlists.map(({ entry: _entry, ...playlist }) => playlist) } });
    case "createPlaylist": {
      const entry = params.getAll("songId").flatMap((songId) => songsById.get(songId) ?? []);
      const playlist = {
        id: `pl-${library.playlists.length}-${Date.now()}`,
        name: params.get("name") ?? "untitled",
        songCount: entry.length,
        duration: entry.reduce((sum, song) => sum + (song.duration ?? 0), 0),
        owner: USER,
        changed: new Date().toISOString(),
        entry,
      };
      library.playlists.push(playlist);
      return ok({ playlist });
    }
    case "updatePlaylist": {
      const playlist = library.playlists.find((item) => item.id === params.get("playlistId"));
      if (!playlist) return fail(70, "playlist not found");
      const entry = [...(playlist.entry ?? [])];
      const removing = new Set(params.getAll("songIndexToRemove").map(Number));
      const kept = entry.filter((_, index) => !removing.has(index));
      kept.push(...params.getAll("songIdToAdd").flatMap((songId) => songsById.get(songId) ?? []));
      Object.assign(playlist, {
        entry: kept,
        name: params.get("name") ?? playlist.name,
        songCount: kept.length,
        duration: kept.reduce((sum, song) => sum + (song.duration ?? 0), 0),
        changed: new Date().toISOString(),
      });
      return ok();
    }
    case "deletePlaylist": {
      const at = library.playlists.findIndex((item) => item.id === id);
      if (at >= 0) library.playlists.splice(at, 1);
      return ok();
    }
    case "getPlaylist": {
      const playlist = library.playlists.find((item) => item.id === id);
      return playlist ? ok({ playlist }) : fail(70, "playlist not found");
    }
    case "getLyricsBySongId": {
      const lyrics = library.lyrics.get(id);
      return ok({ lyricsList: { structuredLyrics: lyrics ? [{ lang: "eng", offset: 0, ...lyrics }] : [] } });
    }
    case "getStarred2":
      return ok({
        starred2: {
          song: library.songs.filter((song) => starred.has(song.id)).map(withStar),
          album: library.albums.filter((album) => starred.has(album.id)).map(summary),
          artist: library.artists.filter((artist) => starred.has(artist.id)).map(({ album: _albums, ...artist }) => withStar(artist)),
        },
      });
    case "setRating": {
      const rating = Number(params.get("rating"));
      if (rating) ratings.set(id, rating);
      else ratings.delete(id);
      return ok();
    }
    case "star":
    case "unstar":
      for (const key of ["id", "albumId", "artistId"])
        for (const value of params.getAll(key)) {
          if (endpoint === "star") starred.set(value, new Date().toISOString());
          else starred.delete(value);
        }
      return ok();
    case "savePlayQueue":
      playQueue = {
        entry: params.getAll("id").flatMap((songId) => songsById.get(songId) ?? []),
        current: params.get("current") ?? undefined,
        position: Number(params.get("position") ?? 0),
        changed: new Date().toISOString(),
        changedBy: params.get("c") ?? "",
      };
      return ok();
    case "getPlayQueue":
      return ok(playQueue ? { playQueue } : {});
    case "savePlayQueueByIndex": {
      const entry = params.getAll("id").flatMap((songId) => songsById.get(songId) ?? []);
      const index = Number(params.get("currentIndex") ?? 0);
      playQueue = {
        entry,
        current: entry[index]?.id,
        position: Number(params.get("position") ?? 0),
        changed: new Date().toISOString(),
        changedBy: params.get("c") ?? "",
      };
      return ok();
    }
    case "getPlayQueueByIndex": {
      if (!playQueue) return ok({});
      const { current, ...rest } = playQueue;
      return ok({
        playQueueByIndex: {
          ...rest,
          currentIndex: Math.max(
            0,
            rest.entry.findIndex((song) => song.id === current),
          ),
        },
      });
    }
    case "getNowPlaying":
      return ok({ nowPlaying: {} });
    case "getCoverArt":
      return cover(id, Number(params.get("size") ?? 300));
    case "stream":
    case "download": {
      const song = songsById.get(id);
      return song ? stream(song, request) : new Response("not found", { status: 404 });
    }
    default:
      return fail(0, `mock: ${endpoint} not implemented`);
  }
}

/**
 * A tiny LRCLIB at /lrclib: synced lyrics for songs Navidrome has none for, when their number is even (so some are
 * found there and some aren't anywhere).
 */
function lrclib(url: URL): Response {
  if (url.pathname === "/lrclib/api/get") return new Response("not found", { status: 404 });
  if (url.pathname !== "/lrclib/api/search") return new Response("not found", { status: 404 });
  const title = url.searchParams.get("track_name") ?? "";
  const song = library.songs.find(
    (candidate) => candidate.title === title && !library.lyrics.has(candidate.id) && Number(candidate.id.slice(3)) % 2 === 0,
  );
  if (!song) return Response.json([]);
  const synced = Array.from({ length: 12 }, (_, i) => `[00:${String(i * 4).padStart(2, "0")}.00]${song.title} from lrclib ${i + 1}`).join(
    "\n",
  );
  return Response.json([
    {
      id: Number(song.id.slice(3)),
      trackName: song.title,
      artistName: song.artist,
      duration: song.duration,
      instrumental: false,
      plainLyrics: null,
      syncedLyrics: synced,
    },
  ]);
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/lrclib/")) return lrclib(url);
    const match = /^\/rest\/(\w+?)(?:\.view)?$/.exec(url.pathname);
    if (!match?.[1]) return new Response("not found", { status: 404 });
    const params = new URLSearchParams(url.search);
    if (request.method === "POST") for (const [key, value] of new URLSearchParams(await request.text())) params.append(key, value);
    if (!authorized(params)) return fail(40, "Wrong username or password");
    return handle(match[1], params, request);
  },
});

console.log(`mock subsonic on :${server.port} with ${library.songs.length} songs`);
