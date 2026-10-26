import { HoverCard, HoverCardContent, HoverCardTrigger } from "@keep/ui/components/hover-card";
import { fileFormat } from "@/lib/format";
import { appliedGain } from "@/lib/player";
import { getSetting } from "@/lib/settings";
import { QUALITIES } from "@/lib/stream-quality";
import { qualityOf } from "@/lib/subsonic";
import type { Song } from "@/lib/types";
import { Cover } from "./cover";

/** Hovering the cover: the album, its year, the file and what ReplayGain does to it. */
function SongDetails({ song }: { song: Song }) {
  const gain = appliedGain();
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
      <dt className="text-muted-foreground">album</dt>
      <dd className="truncate">{[song.album, song.year].filter(Boolean).join(" · ") || "—"}</dd>
      <dt className="text-muted-foreground">file</dt>
      <dd>{fileFormat(song) || "—"}</dd>
      {qualityOf(song.id) !== "original" && (
        <>
          <dt className="text-muted-foreground">playing as</dt>
          <dd>{QUALITIES.find(([name]) => name === qualityOf(song.id))?.[1]}</dd>
        </>
      )}
      <dt className="text-muted-foreground">gain</dt>
      <dd>
        {gain
          ? `${gain.db > 0 ? "+" : ""}${gain.db.toFixed(1)} dB (${gain.mode})`
          : getSetting("normalization") === "off"
            ? "normalization off"
            : "none in the tags"}
      </dd>
    </dl>
  );
}

/** The player bar's cover, with those details on hover. */
export function CoverDetails({ song }: { song: Song }) {
  return (
    <HoverCard>
      <HoverCardTrigger delay={400} render={<span className="shrink-0" />}>
        <Cover id={song.coverArt} size={42} className="size-10.5 shrink-0" priority />
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start">
        <SongDetails song={song} />
      </HoverCardContent>
    </HoverCard>
  );
}
