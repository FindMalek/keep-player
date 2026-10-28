import type { IndexStatus, LyricsSearch, SearchResults } from "@lodesong/shared/search";
import { queryOptions } from "@tanstack/react-query";
import { rpc } from "./rpc";

// Only lazy UI uses these: kept out of queries.ts so they stay off the first screen.

const MINUTE = 60_000;

export const apiQueries = {
  lyricsOffset: (songId: string) =>
    queryOptions({
      queryKey: ["lyricsOffset", songId],
      queryFn: async (): Promise<number> => {
        const response = await fetch(`/api/lyrics/${encodeURIComponent(songId)}/offset`, { headers: { "x-lodesong": "1" } });
        return response.ok ? ((await response.json()) as { offset: number }).offset : 0;
      },
      staleTime: 0,
    }),
  session: () =>
    queryOptions({
      queryKey: ["session"],
      queryFn: async () => {
        const response = await fetch("/auth/session");
        if (!response.ok) throw new Error(`session: ${response.status}`);
        return (await response.json()) as {
          user: string;
          server: string;
          admin?: boolean;
          oneSession?: boolean;
          ai?: boolean;
          feedback?: boolean;
          lyterionAdd?: boolean;
        };
      },
      staleTime: Number.POSITIVE_INFINITY,
    }),
  version: () => rpc.version.queryOptions({ staleTime: 60 * MINUTE }),
  searchIndex: () =>
    queryOptions({
      queryKey: ["searchIndex"],
      queryFn: async (): Promise<IndexStatus> => {
        const response = await fetch("/api/index", { headers: { "x-lodesong": "1" } });
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
        const response = await fetch(`/api/search/lyrics?q=${encodeURIComponent(query)}`, { headers: { "x-lodesong": "1" }, signal });
        if (!response.ok) throw new Error(`lyrics search: ${response.status}`);
        return (await response.json()) as LyricsSearch;
      },
      staleTime: MINUTE,
    }),
  search: (query: string, limit = 8) =>
    queryOptions({
      queryKey: ["search", query, limit],
      queryFn: async ({ signal }): Promise<SearchResults> => {
        const response = await fetch(`/api/search?${new URLSearchParams({ q: query, limit: String(limit) })}`, {
          headers: { "x-lodesong": "1" },
          signal,
        });
        if (!response.ok) throw new Error(`search: ${response.status}`);
        return (await response.json()) as SearchResults;
      },
      staleTime: MINUTE,
    }),
};
