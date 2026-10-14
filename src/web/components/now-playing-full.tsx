import { useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { currentSong, usePlayer } from "@/lib/player";
import { Cover } from "./cover";
import { LyricsView } from "./lyrics-view";

/** ⇧F: the cover large and the lyrics big, for across the room. Esc closes. */
export function NowPlayingFull({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const song = usePlayer(currentSong);
  // Focus lands on the title, not the first lyric line (which would draw a focus ring on it).
  const title = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={title}
        className="top-0 left-0 grid h-svh w-screen bg-background max-w-none translate-x-0 translate-y-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-10 border-0 p-10 sm:max-w-none"
      >
        {song ? (
          <>
            <div className="flex min-w-0 flex-col justify-center gap-4">
              <Cover id={song.coverArt} size={512} priority className="w-full max-w-[60vh]" />
              <div className="min-w-0">
                <DialogTitle ref={title} tabIndex={-1} className="truncate font-medium text-2xl outline-none">
                  {song.title}
                </DialogTitle>
                <DialogDescription className="truncate text-lg">{[song.artist, song.album].filter(Boolean).join(" · ")}</DialogDescription>
              </div>
            </div>
            <div className="min-h-0 overflow-y-auto">
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
