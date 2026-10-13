import {
  ListMusicIcon,
  MicVocalIcon,
  PauseIcon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { type ComponentProps, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { clock, quality } from "@/lib/format";
import { currentSong, player, usePlayer } from "@/lib/player";
import { cn } from "@/lib/utils";
import { Cover } from "./cover";
import { Link } from "./link";

export type Panel = "queue" | "lyrics" | null;

/** Ghost icon button; `on` adds the small square under it that marks an active mode. */
function ToolButton({ on, className, ...props }: ComponentProps<typeof Button> & { on?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "relative text-muted-foreground hover:text-foreground",
        on && "text-foreground after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:bg-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Seek bar that follows playback but holds the dragged value until release. */
function Seek({ position, duration }: { position: number; duration: number }) {
  const [dragging, setDragging] = useState<number | null>(null);
  return (
    <Slider
      aria-label="seek"
      className="w-full"
      max={Math.max(duration, 1)}
      step={1}
      value={[dragging ?? position]}
      onValueChange={(value) => setDragging(Array.isArray(value) ? (value[0] ?? 0) : value)}
      onValueCommitted={(value) => {
        player.seek(Array.isArray(value) ? (value[0] ?? 0) : value);
        setDragging(null);
      }}
    />
  );
}

export function PlayerBar({ panel, onPanel }: { panel: Panel; onPanel: (panel: Panel) => void }) {
  const state = usePlayer();
  const song = currentSong(state);
  if (!song) return null;

  return (
    <footer className="grid h-16 shrink-0 grid-cols-[minmax(0,1fr)_minmax(320px,1.4fr)_minmax(0,1fr)] items-center gap-4 border-t bg-background px-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <Cover id={song.coverArt} size={42} className="size-[42px] shrink-0" />
        <div className="flex min-w-0 flex-col">
          {song.albumId && (
            <Link href={`/album/${song.albumId}`} className="truncate font-medium underline-offset-3 hover:underline">
              {song.title}
            </Link>
          )}
          {song.artistId && (
            <Link href={`/artist/${song.artistId}`} className="truncate text-muted-foreground text-xs underline-offset-3 hover:underline">
              {song.artist}
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-center gap-2.5">
          <ToolButton on={state.shuffle} onClick={player.toggleShuffle} aria-label="shuffle" aria-pressed={state.shuffle}>
            <ShuffleIcon />
          </ToolButton>
          <ToolButton onClick={player.previous} aria-label="previous">
            <SkipBackIcon className="fill-current" />
          </ToolButton>
          <Button size="icon" onClick={() => player.toggle()} aria-label={state.playing ? "pause" : "play"}>
            {state.playing ? <PauseIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
          </Button>
          <ToolButton onClick={player.next} aria-label="next">
            <SkipForwardIcon className="fill-current" />
          </ToolButton>
          <ToolButton on={state.repeat !== "off"} onClick={player.cycleRepeat} aria-label={`repeat ${state.repeat}`}>
            {state.repeat === "one" ? <Repeat1Icon /> : <RepeatIcon />}
          </ToolButton>
        </div>
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2.5 font-mono text-[11px] text-muted-foreground tabular-nums">
          <span className="text-right">{clock(state.position)}</span>
          <Seek position={state.position} duration={state.duration} />
          <span>{clock(state.duration)}</span>
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-1">
        <span className="mr-2 truncate font-mono text-[11px] text-muted-foreground">
          {state.buffering ? "loading…" : (state.error ?? quality(song.suffix, song.bitRate))}
        </span>
        <ToolButton on={panel === "lyrics"} onClick={() => onPanel(panel === "lyrics" ? null : "lyrics")} aria-label="lyrics">
          <MicVocalIcon />
        </ToolButton>
        <ToolButton on={panel === "queue"} onClick={() => onPanel(panel === "queue" ? null : "queue")} aria-label="queue">
          <ListMusicIcon />
        </ToolButton>
        <ToolButton onClick={player.toggleMute} aria-label={state.muted ? "unmute" : "mute"}>
          {state.muted || state.volume === 0 ? <VolumeXIcon /> : <Volume2Icon />}
        </ToolButton>
        <Slider
          aria-label="volume"
          className="w-24"
          max={1}
          step={0.01}
          value={[state.muted ? 0 : state.volume]}
          onValueChange={(value) => player.setVolume(Array.isArray(value) ? (value[0] ?? 0) : value)}
        />
      </div>
    </footer>
  );
}
