import type { Lyrics } from "@keep/shared/lyrics";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { infiniteQueryOptions, type Query, QueryClient, queryOptions } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";
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

/** Search results change with every keystroke, and offsets, history and moments change in other browsers: none is kept across reloads. */
export const shouldPersist = (query: Query) =>
  query.state.status === "success" &&
  !["search", "lyricsSearch", "lyricsOffset", "session", "searchIndex", "history", "playlistHidden", "moments"].includes(
    query.queryKey[0] as string,
  );

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
  songsByGenre: (genre: string, count: number) =>
    queryOptions({
      queryKey: ["songsByGenre", genre, count],
      queryFn: () =>
        api<{ songsByGenre: { song?: Song[] } }>("getSongsByGenre", { genre, count }).then((response) => response.songsByGenre.song ?? []),
      staleTime: 5 * MINUTE,
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
  /** Everything you liked (getStarred2), newest first per kind as Navidrome returns it. */
  starred: () =>
    queryOptions({
      queryKey: ["starred"],
      queryFn: () =>
        api<{ starred2: { song?: Song[]; album?: Album[]; artist?: Artist[] } }>("getStarred2").then(({ starred2 }) => ({
          song: starred2.song ?? [],
          album: starred2.album ?? [],
          artist: starred2.artist ?? [],
        })),
      staleTime: MINUTE,
    }),
  playlists: () =>
    queryOptions({
      queryKey: ["playlists"],
      queryFn: () => api<{ playlists: { playlist?: Playlist[] } }>("getPlaylists").then((response) => response.playlists.playlist ?? []),
      // Edited from every device: painted from cache, checked again when shown anew after 30 s. Not 0: the sidebar
      // always shows it, so every alt-tab refetched it.
      staleTime: 30_000,
    }),
  playlist: (id: string) =>
    queryOptions({
      queryKey: ["playlist", id],
      queryFn: () => api<{ playlist: Playlist }>("getPlaylist", { id }).then((response) => response.playlist),
      // Edited here and on other devices: shown from cache at once, checked when the page opens after 30 s. Edits made
      // here read it fresh (playlists.ts) and update the cache themselves.
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

/**
 * The home page's rows, requested as soon as we know who is signed in: the page's code is still downloading then, and
 * waiting for it to render would start the lists (and so the first covers) several hundred milliseconds later.
 */
export function prefetchHome(): void {
  for (const type of ["newest", "recent", "frequent", "random"] as const) void queryClient.prefetchQuery(queries.albumList(type, 12));
}

// Logout or a different account: forget everything the previous one loaded, in memory and on disk.
onAccountChange(async () => {
  queryClient.clear();
  await persister.removeClient();
});
