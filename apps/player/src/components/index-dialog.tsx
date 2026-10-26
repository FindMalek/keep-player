import { Button } from "@keep/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@keep/ui/components/dialog";
import { useQuery } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";
import { apiQueries } from "@/lib/api-queries";
import { queryClient } from "@/lib/queries";
import { EmptyState } from "./library";

const count = (value: number) => value.toLocaleString();

/** Admins: what the search index holds, when it last synced with Navidrome, and a way to rebuild it now. */
export function IndexDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, isError } = useQuery({ ...apiQueries.searchIndex(), enabled: open });

  async function rebuild(): Promise<void> {
    const response = await fetch("/api/index", { method: "POST", headers: { "x-keep-player": "1" } }).catch(() => null);
    if (response?.ok) queryClient.setQueryData(apiQueries.searchIndex().queryKey, await response.json());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-mono">library index</DialogTitle>
          <DialogDescription>
            search runs on the server's own copy of the library. it syncs after every navidrome scan and once a day.
          </DialogDescription>
        </DialogHeader>
        {isError ? (
          <EmptyState>couldn't read the index</EmptyState>
        ) : !data ? (
          <EmptyState>loading…</EmptyState>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 font-mono text-sm">
            <dt className="text-muted-foreground">songs</dt>
            <dd className="tabular-nums">{count(data.songs)}</dd>
            <dt className="text-muted-foreground">albums</dt>
            <dd className="tabular-nums">{count(data.albums)}</dd>
            <dt className="text-muted-foreground">artists</dt>
            <dd className="tabular-nums">{count(data.artists)}</dd>
            <dt className="text-muted-foreground">last sync</dt>
            <dd>
              {data.building
                ? "syncing now…"
                : data.lastSync
                  ? new Date(data.lastSync).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                  : "not yet"}
            </dd>
          </dl>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={!data || data.building} onClick={() => void rebuild()}>
            <RefreshCwIcon className={data?.building ? "animate-spin" : undefined} />
            rebuild now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
