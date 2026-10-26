import { Button } from "@keep/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { currentSong, player, usePlayer, usePosition } from "@/lib/player";
import { queries } from "@/lib/queries";
import { Cover } from "./cover";
import { LikeButton } from "./like-button";
import { activeLine } from "./lyrics-view";

function CurrentLine({ songId }: { songId: string }) {
  const { data } = useQuery(queries.lyrics(songId));
  const lines = data?.status === "synced" ? data.lines : null;
  const index = usePosition((seconds) => (lines ? activeLine(lines, seconds * 1000) : -1));
  const text = lines?.[index]?.text;
  return text ? <span className="max-w-full truncate font-medium text-small">{text}</span> : null;
}

// Fits an always-on-top window at any size: under 90 px tall only title and buttons, 260 px up stacks the cover.
// Media queries here answer for the picture-in-picture window, not the tab.
function MiniPlayer() {
  const song = usePlayer(currentSong);
  const playing = usePlayer((state) => state.playing);
  if (!song) return <p className="p-4 font-mono text-muted-foreground text-xs">nothing playing</p>;
  return (
    <div className="flex h-[calc(100svh/var(--zoom))] items-center gap-3 overflow-hidden bg-background p-3 text-foreground [@media(max-height:89px)]:py-1.5 [@media(min-height:260px)]:flex-col [@media(min-height:260px)]:justify-center [@media(min-height:260px)]:text-center">
      <Cover
        id={song.coverArt}
        size={512}
        className="aspect-square h-full max-h-[108px] w-auto shrink-0 [@media(max-height:89px)]:hidden [@media(min-height:260px)]:h-auto [@media(min-height:260px)]:max-h-none [@media(min-height:260px)]:w-[min(100%,calc(100svh-150px))]"
        priority
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 [@media(min-height:260px)]:w-full [@media(min-height:260px)]:flex-none [@media(min-height:260px)]:items-center">
        <span className="max-w-full truncate font-medium text-sm">{song.title}</span>
        <span className="max-w-full truncate text-muted-foreground text-xs [@media(max-height:89px)]:hidden">{song.artist}</span>
        <span className="contents [@media(max-height:89px)]:hidden">
          <CurrentLine songId={song.id} />
        </span>
        <div className="mt-1 flex items-center gap-1 [@media(max-height:89px)]:mt-0">
          <Button variant="ghost" size="icon-sm" aria-label="previous" onClick={() => player.previous()}>
            <SkipBackIcon className="fill-current" />
          </Button>
          <Button size="icon-sm" aria-label={playing ? "pause" : "play"} onClick={() => player.toggle()}>
            {playing ? <PauseIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="next" onClick={() => player.next()}>
            <SkipForwardIcon className="fill-current" />
          </Button>
          <LikeButton kind="song" id={song.id} label={song.title} className="size-7" />
        </div>
      </div>
    </div>
  );
}

export function MiniPlayerPortal({ target }: { target: Window }) {
  return createPortal(<MiniPlayer />, target.document.body);
}
