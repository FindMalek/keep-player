import { SmartphoneIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { Elsewhere } from "@/lib/elsewhere";
import { Cover } from "./cover";

/** "playing on Arpeggi" in the sidebar; hover for the song, and the queue hand-off one click away. */
export function ElsewhereBadge({ playing }: { playing: Elsewhere }) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={300}
        render={
          <Badge variant="outline" className="mx-2 mb-1 max-w-[calc(100%-1rem)] gap-1.5 font-mono font-normal text-muted-foreground" />
        }
      >
        <SmartphoneIcon />
        <span className="truncate">playing on {playing.device}</span>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="end" className="flex w-64 flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <Cover id={playing.song.coverArt} size={48} className="size-10 shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-sm">{playing.song.title}</span>
            <span className="truncate text-muted-foreground">{playing.song.artist}</span>
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => void import("@/lib/queue-sync").then((sync) => sync.pullQueue(true))}>
          continue here
        </Button>
      </HoverCardContent>
    </HoverCard>
  );
}
