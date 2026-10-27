import { Button } from "@keep/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@keep/ui/components/dialog";
import { PlayIcon, SaveIcon, ShuffleIcon, XIcon } from "lucide-react";
import { cancelRadioPreview, dropFromPreview, playRadio, reshuffleRadio, savePreview, useRadioPreview } from "@/lib/radio";
import { Cover } from "./cover";

/** What a radio would start with, before it plays: drop songs, reshuffle, save it, or play. */
export function RadioPreviewDialog() {
  const preview = useRadioPreview();
  return (
    <Dialog open={preview !== null} onOpenChange={(open) => !open && cancelRadioPreview()}>
      {preview && (
        <DialogContent className="flex max-h-[80svh] flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="font-mono">{preview.station.name}</DialogTitle>
            <DialogDescription>{preview.songs.length} songs to start with. It keeps adding more as it plays.</DialogDescription>
          </DialogHeader>
          <ul aria-label="radio preview" className="-mx-2 min-h-0 flex-1 overflow-y-auto">
            {preview.songs.map((song) => (
              <li key={song.id} className="flex items-center gap-2 px-2 py-1">
                <Cover id={song.coverArt} size={32} className="size-8 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{song.title}</span>
                  <span className="block truncate text-muted-foreground text-xs">{song.artist}</span>
                </span>
                <Button variant="ghost" size="icon-xs" aria-label={`remove ${song.title}`} onClick={() => dropFromPreview(song.id)}>
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <Button variant="outline" size="xs" className="font-mono" onClick={() => void reshuffleRadio()}>
                <ShuffleIcon />
                reshuffle
              </Button>
              <Button variant="outline" size="xs" className="font-mono" onClick={() => void savePreview()}>
                <SaveIcon />
                save as playlist
              </Button>
            </div>
            <Button size="xs" className="font-mono" disabled={!preview.songs.length} onClick={playRadio}>
              <PlayIcon />
              play radio
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
