import { Button } from "@keep/ui/components/button";
import { CheckIcon, DownloadIcon } from "lucide-react";
import { keepOffline, useCachedIds, useOfflineStatus } from "@/lib/offline";
import type { Song } from "@/lib/types";
import { Hint } from "./hint";

/** Pin an album or playlist in the offline cache: downloaded now, never evicted. Shows progress while it downloads. */
export function KeepOffline({ group, songs }: { group: string; songs: Song[] }) {
  const status = useOfflineStatus();
  const cached = useCachedIds();
  const kept = group in status.pinned;
  const done = songs.filter((song) => cached.has(song.id)).length;
  const label = !kept ? "keep offline" : done < songs.length ? `downloading ${done}/${songs.length}` : "kept offline";
  return (
    <Hint label={kept ? "remove from offline (stays until space is needed)" : "download to play without a connection"}>
      <Button variant="outline" aria-pressed={kept} onClick={() => keepOffline(group, kept ? null : songs.map((song) => song.id))}>
        {kept && done === songs.length ? <CheckIcon /> : <DownloadIcon />}
        {label}
      </Button>
    </Hint>
  );
}
