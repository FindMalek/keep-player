import { rpc } from "@/lib/rpc";

/** Your listening between two times, days and hours in this browser's time zone. Not persisted. */
export const statsQuery = (from: number, to: number) =>
  rpc.stats.range.queryOptions({ input: { from, to, tz: -new Date().getTimezoneOffset() }, staleTime: 60_000 });
