import type { IndexStatus, LyricsSearch, SearchResults } from "@keep/shared/search";
import { queryOptions } from "@tanstack/react-query";

/*
 * Queries for the server's own /api endpoints that only lazy UI uses (palette, search page, lyrics panel, admin and
 * user menus), kept out of queries.ts so they stay off the first screen. Not persisted (see queries.ts).
 */

const MINUTE = 60_000;

export const apiQueries = {
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
        return (await response.json()) as { user: string; server: string; admin?: boolean; oneSession?: boolean; ai?: boolean };
      },
      staleTime: Number.POSITIVE_INFINITY,
    }),
  /** The running version, and for admins a newer release when the server checks (`UPDATE_CHECK=on`). Hourly. */
  version: () =>
    queryOptions({
      queryKey: ["version"],
      queryFn: async () => {
        const response = await fetch("/api/version");
        if (!response.ok) throw new Error(`version: ${response.status}`);
        return (await response.json()) as { version: string; latest: string | null; updateAvailable: boolean };
      },
      staleTime: 60 * MINUTE,
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
  lyricsSearch: (query: string) =>
    queryOptions({
      queryKey: ["lyricsSearch", query],
      queryFn: async ({ signal }): Promise<LyricsSearch> => {
        const response = await fetch(`/api/search/lyrics?q=${encodeURIComponent(query)}`, { headers: { "x-keep-player": "1" }, signal });
        if (!response.ok) throw new Error(`lyrics search: ${response.status}`);
        return (await response.json()) as LyricsSearch;
      },
      staleTime: MINUTE,
    }),
  /** The server's ranked search (operators, typos, your likes first); keeps the previous results while typing. */
  search: (query: string, limit = 8) =>
    queryOptions({
      queryKey: ["search", query, limit],
      queryFn: async ({ signal }): Promise<SearchResults> => {
        const response = await fetch(`/api/search?${new URLSearchParams({ q: query, limit: String(limit) })}`, {
          headers: { "x-keep-player": "1" },
          signal,
        });
        if (!response.ok) throw new Error(`search: ${response.status}`);
        return (await response.json()) as SearchResults;
      },
      staleTime: MINUTE,
    }),
};
