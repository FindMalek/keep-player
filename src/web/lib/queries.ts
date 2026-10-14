import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { infiniteQueryOptions, type Query, QueryClient, queryOptions } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";
import type { Lyrics } from "../../shared/lyrics";
import type { IndexStatus } from "../../shared/search";
import { api, onAccountChange } from "./subsonic";
import type { Album, Artist, ArtistInfo, Directory, Genre, Playlist, Song } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** How long a persisted cache is trusted at all; each query still revalidates per its staleTime. */
export const CACHE_MAX_AGE = 7 * 24 * HOUR;
/**
 * Bump when cached shapes change. Accounts are kept apart by clearing the cache whenever the account changes (below),
 * not by this: it's read once at startup, before login.
 */
export const CACHE_VERSION = "1";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * MINUTE, gcTime: CACHE_MAX_AGE, retry: 1, refetchOnWindowFocus: true, refetchOnReconnect: true },
  },
});

/** The cache survives reloads in IndexedDB; on a cold start pages render from it and revalidate in the background. */
export const persister = createAsyncStoragePersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  key: "keep-player:cache",
  throttleTime: 1000,
});

/** Search results change with every keystroke and offsets must be fresh: neither is kept across reloads. */
export const shouldPersist = (query: Query) =>
  query.state.status === "success" && !["search", "lyricsOffset", "session", "searchIndex"].includes(query.queryKey[0] as string);

/** Long lists load this many items at a time, the next page fetched when the reader is 80% down. */
export const PAGE_SIZE = 200;

export interface IndexEntry {
  name: string;
  artist: { id: string; name: string }[];
}

/**
 * Every query the app makes, with its key and freshness. Detail pages rarely change (1 h), lists a bit more (5 min),
 * playlists are edited from other clients (30 s), lyrics never change.
 */
export const queries = {
  albumList: (type: string, size: number, extra: Record<string, string | number> = {}) =>
    queryOptions({
      queryKey: ["albumList", type, size, extra],
      queryFn: () =>
        api<{ albumList2: { album?: Album[] } }>("getAlbumList2", { type, size, ...extra }).then(
          (response) => response.albumList2.album ?? [],
        ),
      // A random pick should stay put until asked to reshuffle.
      staleTime: type === "random" ? Number.POSITIVE_INFINITY : 5 * MINUTE,
    }),
  albumPages: (type: string) =>
    infiniteQueryOptions({
      queryKey: ["albumPages", type],
      queryFn: ({ pageParam }) =>
        api<{ albumList2: { album?: Album[] } }>("getAlbumList2", { type, size: PAGE_SIZE, offset: pageParam }).then(
          (response) => response.albumList2.album ?? [],
        ),
      initialPageParam: 0,
      getNextPageParam: (last, _pages, offset) => (last.length === PAGE_SIZE ? offset + PAGE_SIZE : undefined),
    }),
  songPages: () =>
    infiniteQueryOptions({
      queryKey: ["songPages"],
      queryFn: ({ pageParam }) =>
        api<{ searchResult3: { song?: Song[] } }>("search3", {
          query: "",
          songCount: PAGE_SIZE,
          songOffset: pageParam,
          artistCount: 0,
          albumCount: 0,
        }).then((response) => response.searchResult3.song ?? []),
      initialPageParam: 0,
      getNextPageParam: (last, _pages, offset) => (last.length === PAGE_SIZE ? offset + PAGE_SIZE : undefined),
    }),
  /** Library size, for headers before the lists finish loading. Albums are summed from the (cached) artist index. */
  totals: () =>
    queryOptions({
      queryKey: ["totals"],
      queryFn: async () => {
        const [scan, index] = await Promise.all([
          api<{ scanStatus: { count?: number } }>("getScanStatus"),
          queryClient.fetchQuery(queries.artists()),
        ]);
        const albums = index.flatMap((group) => group.artist).reduce((sum, artist) => sum + (artist.albumCount ?? 0), 0);
        return { songs: scan.scanStatus.count ?? 0, albums };
      },
      staleTime: 30 * MINUTE,
    }),
  randomSongs: (size: number) =>
    queryOptions({
      queryKey: ["randomSongs", size],
      queryFn: () =>
        api<{ randomSongs: { song?: Song[] } }>("getRandomSongs", { size }).then((response) => response.randomSongs.song ?? []),
      staleTime: 0,
    }),
  album: (id: string) =>
    queryOptions({
      queryKey: ["album", id],
      queryFn: () => api<{ album: Album }>("getAlbum", { id }).then((response) => response.album),
      staleTime: HOUR,
    }),
  artist: (id: string) =>
    queryOptions({
      queryKey: ["artist", id],
      queryFn: () => api<{ artist: Artist }>("getArtist", { id }).then((response) => response.artist),
      staleTime: HOUR,
    }),
  artistInfo: (id: string) =>
    queryOptions({
      queryKey: ["artistInfo", id],
      queryFn: () => api<{ artistInfo2: ArtistInfo }>("getArtistInfo2", { id }).then((response) => response.artistInfo2),
      staleTime: HOUR,
    }),
  topSongs: (artist: string) =>
    queryOptions({
      queryKey: ["topSongs", artist],
      queryFn: () =>
        api<{ topSongs: { song?: Song[] } }>("getTopSongs", { artist, count: 10 }).then((response) => response.topSongs.song ?? []),
      staleTime: HOUR,
    }),
  artists: () =>
    queryOptions({
      queryKey: ["artists"],
      queryFn: () =>
        api<{ artists: { index?: { name: string; artist: Artist[] }[] } }>("getArtists").then((response) => response.artists.index ?? []),
      staleTime: HOUR,
    }),
  genres: () =>
    queryOptions({
      queryKey: ["genres"],
      queryFn: () => api<{ genres: { genre?: Genre[] } }>("getGenres").then((response) => response.genres.genre ?? []),
      staleTime: HOUR,
    }),
  playlists: () =>
    queryOptions({
      queryKey: ["playlists"],
      queryFn: () => api<{ playlists: { playlist?: Playlist[] } }>("getPlaylists").then((response) => response.playlists.playlist ?? []),
      staleTime: 30_000,
    }),
  playlist: (id: string) =>
    queryOptions({
      queryKey: ["playlist", id],
      queryFn: () => api<{ playlist: Playlist }>("getPlaylist", { id }).then((response) => response.playlist),
      staleTime: 30_000,
    }),
  folders: () =>
    queryOptions({
      queryKey: ["folders"],
      queryFn: () => api<{ indexes: { index?: IndexEntry[] } }>("getIndexes").then((response) => response.indexes.index ?? []),
      staleTime: HOUR,
    }),
  directory: (id: string) =>
    queryOptions({
      queryKey: ["directory", id],
      queryFn: () => api<{ directory: Directory }>("getMusicDirectory", { id }).then((response) => response.directory),
      staleTime: HOUR,
    }),
  lyrics: (songId: string) =>
    queryOptions({
      queryKey: ["lyrics", songId],
      queryFn: async (): Promise<Lyrics> => {
        const response = await fetch(`/api/lyrics/${encodeURIComponent(songId)}`, { headers: { "x-keep-player": "1" } });
        if (!response.ok) throw new Error(`lyrics: ${response.status}`);
        return (await response.json()) as Lyrics;
      },
      // Found lyrics never change; "missing" is worth asking again in a day (LRCLIB keeps growing).
      staleTime: (query) => (query.state.data?.status === "missing" ? 86_400_000 : Number.POSITIVE_INFINITY),
    }),
  /** Your timing nudge for a song's lyrics: tiny, always fresh (it may have changed in another browser), never persisted. */
  lyricsOffset: (songId: string) =>
    queryOptions({
      queryKey: ["lyricsOffset", songId],
      queryFn: async (): Promise<number> => {
        const response = await fetch(`/api/lyrics/${encodeURIComponent(songId)}/offset`, { headers: { "x-keep-player": "1" } });
        return response.ok ? ((await response.json()) as { offset: number }).offset : 0;
      },
      staleTime: 0,
    }),
  /** Who is signed in and whether they are a Navidrome admin; asked once per load, never persisted. */
  session: () =>
    queryOptions({
      queryKey: ["session"],
      queryFn: async () => {
        const response = await fetch("/auth/session");
        if (!response.ok) throw new Error(`session: ${response.status}`);
        return (await response.json()) as { user: string; server: string; admin?: boolean };
      },
      staleTime: Number.POSITIVE_INFINITY,
    }),
  /** The server's search index (admins only), refreshed every 2 s while it rebuilds. */
  searchIndex: () =>
    queryOptions({
      queryKey: ["searchIndex"],
      queryFn: async (): Promise<IndexStatus> => {
        const response = await fetch("/api/index", { headers: { "x-keep-player": "1" } });
        if (!response.ok) throw new Error(`index: ${response.status}`);
        return (await response.json()) as IndexStatus;
      },
      staleTime: 0,
      refetchInterval: (query) => (query.state.data?.building ? 2000 : false),
    }),
  search: (query: string) =>
    queryOptions({
      queryKey: ["search", query],
      queryFn: () =>
        api<{ searchResult3: { artist?: Artist[]; album?: Album[]; song?: Song[] } }>("search3", {
          query,
          artistCount: 4,
          albumCount: 6,
          songCount: 8,
        }).then((response) => response.searchResult3),
      staleTime: MINUTE,
    }),
};

/** Warm the data a link leads to, so the click shows a finished page. */
export function prefetchPath(path: string): void {
  const [, section, raw] = path.split("/");
  const id = raw ? decodeURIComponent(raw) : "";
  if (!id) return;
  if (section === "album") void queryClient.prefetchQuery(queries.album(id));
  if (section === "artist") {
    void queryClient.prefetchQuery(queries.artist(id));
    void queryClient.prefetchQuery(queries.artistInfo(id));
  }
  if (section === "playlist") void queryClient.prefetchQuery(queries.playlist(id));
  if (section === "genre") void queryClient.prefetchQuery(queries.albumList("byGenre", 200, { genre: id }));
  if (section === "folders") void queryClient.prefetchQuery(queries.directory(id));
}

// Logout or a different account: forget everything the previous one loaded, in memory and on disk.
onAccountChange(async () => {
  queryClient.clear();
  await persister.removeClient();
});
