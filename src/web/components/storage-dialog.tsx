import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { clearOfflineCache, setCacheCap, useOfflineStatus } from "@/lib/offline";

const GB = 1024 ** 3;
const CAPS = [1, 2, 5, 10] as const;
const size = (bytes: number) => (bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);

/** What's saved for offline, how much room it may take, and a way to empty it. */
export function StorageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const status = useOfflineStatus();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    if (open) void navigator.storage?.persisted?.().then(setPersisted);
  }, [open]);
  const kept = Object.keys(status.pinned).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">offline storage</DialogTitle>
          <DialogDescription>
            the next 3 songs always download ahead, so they play and seek without the network. albums and playlists you keep offline are
            never removed; the rest makes room for new songs when the limit is reached.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 font-mono text-xs">
          <dt className="text-muted-foreground">used</dt>
          <dd>
            {size(status.bytes)} · {status.ids.length} songs
          </dd>
          <dt className="text-muted-foreground">kept offline</dt>
          <dd>{kept === 1 ? "1 album or playlist" : `${kept} albums or playlists`}</dd>
          <dt className="text-muted-foreground">protected</dt>
          <dd>
            {persisted === null ? "…" : persisted ? "yes, the browser won't clear it" : "no, the browser may clear it when space is low"}
          </dd>
        </dl>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-muted-foreground text-xs">limit</span>
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label="cache limit"
            value={[String(Math.round(status.cap / GB))]}
            onValueChange={(value: string[]) => value[0] && setCacheCap(Number(value[0]) * GB)}
          >
            {CAPS.map((cap) => (
              <ToggleGroupItem key={cap} value={String(cap)} className="font-mono font-normal">
                {cap} GB
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <Button variant="destructive" onClick={clearOfflineCache} disabled={!status.bytes}>
          clear offline storage
        </Button>
      </DialogContent>
    </Dialog>
  );
}
