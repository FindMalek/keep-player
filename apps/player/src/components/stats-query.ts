import type { ListeningStats } from "@keep/shared/stats";
import { queryOptions } from "@tanstack/react-query";
import { HEADERS } from "@/lib/subsonic";

/** Your listening between two times, days and hours in this browser's time zone. Not persisted. */
export const statsQuery = (from: number, to: number) =>
  queryOptions({
    queryKey: ["stats", from, to],
    queryFn: async ({ signal }): Promise<ListeningStats> => {
      const params = new URLSearchParams({ from: String(from), to: String(to), tz: String(-new Date().getTimezoneOffset()) });
      const response = await fetch(`/api/stats?${params}`, { headers: HEADERS, signal });
      if (!response.ok) throw new Error(`stats: ${response.status}`);
      return (await response.json()) as ListeningStats;
    },
    staleTime: 60_000,
  });
