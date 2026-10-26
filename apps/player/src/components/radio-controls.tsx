import { Button } from "@keep/ui/components/button";
import { Slider } from "@keep/ui/components/slider";
import { BanIcon, CalendarRangeIcon, RadioIcon, SaveIcon, SquareIcon, ThumbsDownIcon, ThumbsUpIcon, UserIcon } from "lucide-react";
import { currentSong, usePlayer } from "@/lib/player";
import {
  banFromRadio,
  moreLikeThis,
  notForThisStation,
  saveStation,
  setVariety,
  startRadio,
  stopRadio,
  toggleArtistLock,
  toggleEraLock,
  useStation,
} from "@/lib/radio";
import { Hint } from "./hint";
import { ToolButton } from "./tool-button";

/** The queue panel's radio strip: tune the station while it plays, or start one from your queue. */
export function RadioControls() {
  const station = useStation();
  const song = usePlayer(currentSong);
  const hasQueue = usePlayer((state) => state.queue.current !== null);
  if (!station)
    return hasQueue ? (
      <div className="px-3 pb-2">
        <Button variant="outline" size="xs" className="font-mono" onClick={() => void startRadio({ kind: "queue" })}>
          <RadioIcon />
          radio from your queue
        </Button>
      </div>
    ) : null;
  const liked = song ? station.liked.has(song.id) : false;
  return (
    <section aria-label="radio" className="mx-3 mb-2 flex flex-col gap-2 border p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
          <RadioIcon className="size-3.5 shrink-0" />
          <span className="truncate">{station.name}</span>
        </span>
        <div className="flex shrink-0 items-center">
          <Hint label="save this station as a playlist">
            <Button variant="ghost" size="icon-xs" aria-label="save as playlist" onClick={() => void saveStation()}>
              <SaveIcon />
            </Button>
          </Hint>
          <Hint label="stop the radio (the queue stays)">
            <Button variant="ghost" size="icon-xs" aria-label="stop radio" onClick={stopRadio}>
              <SquareIcon />
            </Button>
          </Hint>
        </div>
      </div>
      {song && (
        <div className="flex items-center gap-1">
          <Hint label="more like this">
            <ToolButton on={liked} aria-label={`more like ${song.title}`} onClick={() => moreLikeThis(song)}>
              <ThumbsUpIcon />
            </ToolButton>
          </Hint>
          <Hint label="not for this station (skips it)">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              aria-label={`not for this station: ${song.title}`}
              onClick={() => notForThisStation(song)}
            >
              <ThumbsDownIcon />
            </Button>
          </Hint>
          <Hint label="never play this song on any radio">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              aria-label={`never play ${song.title} on radio`}
              onClick={() => void banFromRadio(song)}
            >
              <BanIcon />
            </Button>
          </Hint>
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <Hint label={station.eraLock ? `era: ${station.eraLock[0]}–${station.eraLock[1]} (click to unlock)` : "keep to this song's era"}>
            <ToolButton
              on={Boolean(station.eraLock)}
              aria-label="era lock"
              disabled={!station.eraLock && !song.year}
              onClick={() => toggleEraLock(song)}
            >
              <CalendarRangeIcon />
            </ToolButton>
          </Hint>
          <Hint label={station.artistLock ? `only ${station.artistLock.name} (click to unlock)` : "only this artist"}>
            <ToolButton on={Boolean(station.artistLock)} aria-label="artist lock" onClick={() => toggleArtistLock(song)}>
              <UserIcon />
            </ToolButton>
          </Hint>
        </div>
      )}
      <div className="flex items-center gap-2 font-mono text-meta text-muted-foreground">
        familiar
        <Slider
          thumbLabel="variety"
          className="flex-1"
          min={0}
          max={100}
          value={[Math.round(station.variety * 100)]}
          onValueChange={(value) => setVariety((Array.isArray(value) ? (value[0] ?? 50) : value) / 100)}
        />
        discover
      </div>
    </section>
  );
}
