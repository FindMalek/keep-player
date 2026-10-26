import { Button } from "@keep/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { currentSong, player, usePlayer, usePosition } from "@/lib/player";
import { queries } from "@/lib/queries";
import { Cover } from "./cover";
import { activeLine } from "./lyrics-view";

/** The line being sung now, if the lyrics are synced. */
function CurrentLine({ songId }: { songId: string }) {
  const { data } = useQuery(queries.lyrics(songId));
  const lines = data?.status === "synced" ? data.lines : null;
  const index = usePosition((seconds) => (lines ? activeLine(lines, seconds * 1000) : -1));
  const text = lines?.[index]?.text;
  return text ? <span className="truncate font-medium text-[12.5px]">{text}</span> : null;
}

/** Cover, title, the three buttons and the current lyric line: what fits an always-on-top window. */
function MiniPlayer() {
  const song = usePlayer(currentSong);
  const playing = usePlayer((state) => state.playing);
  if (!song) return <p className="p-4 font-mono text-muted-foreground text-xs">nothing playing</p>;
  return (
    <div className="flex h-[calc(100svh/var(--zoom))] items-center gap-3 bg-background p-3 text-foreground">
      <Cover id={song.coverArt} size={108} className="size-[108px] shrink-0" priority />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium text-sm">{song.title}</span>
        <span className="truncate text-muted-foreground text-xs">{song.artist}</span>
        <CurrentLine songId={song.id} />
        <div className="mt-1 flex gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="previous" onClick={() => player.previous()}>
            <SkipBackIcon className="fill-current" />
          </Button>
          <Button size="icon-sm" aria-label={playing ? "pause" : "play"} onClick={() => player.toggle()}>
            {playing ? <PauseIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="next" onClick={() => player.next()}>
            <SkipForwardIcon className="fill-current" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MiniPlayerPortal({ target }: { target: Window }) {
  return createPortal(<MiniPlayer />, target.document.body);
}
