import { Button } from "@keep/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@keep/ui/components/dialog";
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { currentSong, player, usePlayer } from "@/lib/player";
import { peekUpcoming } from "@/lib/queue";
import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Aura } from "./aura";
import { Cover } from "./cover";
import { LikeButton } from "./like-button";
import { LyricsView } from "./lyrics-view";

const IDLE_MS = 3000;
const sameSongs = (a: Song[], b: Song[]) => a.length === b.length && a.every((song, index) => song.id === b[index]?.id);

/** Pointer and keys keep the controls up; after 3 s of neither, they fade and the cursor hides. */
function useIdle(active: boolean): [boolean, () => void] {
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wake = () => {
    setIdle(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setIdle(true), IDLE_MS);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: restart the timer when the view opens
  useEffect(() => {
    if (!active) return;
    wake();
    return () => clearTimeout(timer.current);
  }, [active]);
  return [idle, wake];
}

export function NowPlayingFull({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const song = usePlayer(currentSong);
  const playing = usePlayer((state) => state.playing);
  const next = usePlayer((state) => peekUpcoming(state.queue, 3), sameSongs);
  const from = usePlayer((state) => state.queue.context.source?.href ?? state.queue.current?.song.albumId ?? "");
  const contextSongs = usePlayer((state) => state.queue.context.songs.slice(0, 200), sameSongs);
  const [idle, wake] = useIdle(open);
  // Focus lands on the title, not the first lyric line (which would draw a focus ring on it).
  const title = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={title}
        onPointerMove={wake}
        onKeyDown={wake}
        data-idle={idle || undefined}
        className="group/full isolate top-0 left-0 grid h-[calc(100svh/var(--zoom))] w-[calc(100vw/var(--zoom))] bg-background max-w-none translate-x-0 translate-y-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-10 border-0 p-10 data-idle:cursor-none sm:max-w-none"
      >
        {song ? (
          <>
            {from && <Aura id={from} songs={contextSongs} className="pointer-events-none absolute inset-0 -z-10 size-full opacity-40" />}
            <div className="flex min-w-0 flex-col justify-center gap-4">
              <Cover id={song.coverArt} size={512} priority className="w-full max-w-[60vh]" />
              <div className="min-w-0">
                <DialogTitle ref={title} tabIndex={-1} className="truncate font-medium text-2xl outline-none">
                  {song.title}
                </DialogTitle>
                <DialogDescription className="truncate text-lg">{[song.artist, song.album].filter(Boolean).join(" · ")}</DialogDescription>
              </div>
              <div className="flex flex-col gap-4 transition-opacity duration-200 group-data-idle/full:opacity-0">
                <div className="-ml-1.5 flex items-center gap-1">
                  <Button variant="ghost" size="icon" aria-label="previous" onClick={() => player.previous()}>
                    <SkipBackIcon className="fill-current" />
                  </Button>
                  <Button size="icon" aria-label={playing ? "pause" : "play"} onClick={() => player.toggle()}>
                    {playing ? <PauseIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="next" onClick={() => player.next()}>
                    <SkipForwardIcon className="fill-current" />
                  </Button>
                  <LikeButton kind="song" id={song.id} label={song.title} className="ml-1" />
                </div>
                {next.length > 0 && (
                  <section aria-label="up next" className="flex flex-col gap-1">
                    <h2 className="font-mono text-meta text-faint">up next</h2>
                    <ol className="flex flex-col gap-0.5 text-muted-foreground text-sm">
                      {next.map((upcoming, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: the same song can come up twice (repeat)
                        <li key={`${upcoming.id}-${index}`} className={cn("truncate", index > 0 && "text-faint")}>
                          {upcoming.title}
                          {upcoming.artist && <span className="text-faint"> · {upcoming.artist}</span>}
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
              </div>
            </div>
            {/* Lines fade in and out at the edges; a mask, so the aura behind stays as it is. */}
            <div className="min-h-0 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_85%,transparent)] [scrollbar-width:none]">
              <LyricsView key={song.id} song={song} size="full" />
            </div>
          </>
        ) : (
          <DialogTitle className="font-mono">nothing playing</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  );
}
