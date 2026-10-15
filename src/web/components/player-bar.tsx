import {
  ChevronDownIcon,
  InfoIcon,
  ListMusicIcon,
  LoaderCircleIcon,
  MicVocalIcon,
  MoonIcon,
  PauseIcon,
  PictureInPicture2Icon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpeakerIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  AudioPlayer,
  AudioPlayerControls,
  AudioPlayerNext,
  AudioPlayerPlay,
  AudioPlayerPrevious,
  AudioPlayerSeek,
  AudioPlayerTime,
  AudioPlayerVolume,
} from "@/components/ui/audio-player";
import { Button } from "@/components/ui/button";
import { VolumeControlMute, VolumeControlSlider } from "@/components/ui/volume-control";
import { useEngineController } from "@/lib/engine-controller";
import { quality } from "@/lib/format";
import { MINI_PLAYER_SUPPORTED, openMiniPlayer } from "@/lib/mini-player";
import { useCachedIds } from "@/lib/offline";
import { currentSong, player, usePlayer, usePosition } from "@/lib/player";
import { contextUpcoming } from "@/lib/queue";
import type { Song } from "@/lib/types";
import { CAN_PICK_OUTPUT } from "@/lib/use-output-devices";
import { cn } from "@/lib/utils";
import { Cover } from "./cover";
import { Hint } from "./hint";
import { LikeButton } from "./like-button";
import { Link } from "./link";
import { OfflineMark } from "./offline-mark";
import { ToolButton } from "./tool-button";
import { Truncated } from "./truncated";

export type Panel = "queue" | "lyrics" | "info" | null;

const ICON_BUTTON = "size-8 rounded-none text-muted-foreground hover:bg-transparent hover:text-foreground";

/** audiocn's time readout reads the live position; this re-renders it once a second instead of every frame. */
function Elapsed() {
  usePosition(Math.floor);
  return <AudioPlayerTime className="w-11 text-[11px]" />;
}

// The device menu (select + permission flow) loads after first paint; the same icon stands in until then.
const OutputDevice = lazy(() => import("./output-device").then((module) => ({ default: module.OutputDevice })));

// The sleep menu (a dropdown) also loads after first paint.
const MomentTicks = lazy(() => import("./moment-ticks").then((module) => ({ default: module.MomentTicks })));
const SleepMenu = lazy(() => import("./sleep-menu").then((module) => ({ default: module.SleepMenu })));

function SleepFallback() {
  const on = usePlayer((state) => state.sleep !== null);
  return (
    <ToolButton on={on} aria-label="sleep timer" disabled>
      <MoonIcon />
    </ToolButton>
  );
}

function OutputDeviceFallback() {
  return (
    <Button variant="ghost" size="sm" className="gap-1 px-1.5 text-muted-foreground" aria-label="output device" disabled>
      <SpeakerIcon />
      <ChevronDownIcon />
    </Button>
  );
}

// Hover cards only matter on hover: they load after the first screen, with the same markup until then.
const CoverDetails = lazy(() => import("./now-playing-details").then((module) => ({ default: module.CoverDetails })));
const ArtistCard = lazy(() => import("./artist-card").then((module) => ({ default: module.ArtistCard })));

function NowPlaying({ song }: { song: Song }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Suspense fallback={<Cover id={song.coverArt} size={42} className="size-[42px] shrink-0" priority />}>
        <CoverDetails song={song} />
      </Suspense>
      <div className="flex min-w-0 flex-col">
        {song.albumId && (
          <Link href={`/album/${song.albumId}`} className="flex min-w-0 font-medium underline-offset-3 hover:underline">
            <Truncated text={song.title} />
          </Link>
        )}
        {song.artistId && (
          <Suspense
            fallback={
              <Link href={`/artist/${song.artistId}`} className="truncate text-muted-foreground text-xs underline-offset-3 hover:underline">
                {song.artist}
              </Link>
            }
          >
            <ArtistCard id={song.artistId} name={song.artist}>
              <Link href={`/artist/${song.artistId}`} className="truncate text-muted-foreground text-xs underline-offset-3 hover:underline">
                {song.artist}
              </Link>
            </ArtistCard>
          </Suspense>
        )}
      </div>
      <Hint label="like" shortcut="like">
        <LikeButton kind="song" id={song.id} label={song.title} className="shrink-0" />
      </Hint>
    </div>
  );
}

const PEEK_SECONDS = 15;

/** The last 15 s of a song: what comes next, and a way to skip it before it starts. */
function UpNextPeek() {
  const nearEnd = usePosition((seconds) => {
    const { duration } = player.getState();
    return duration > PEEK_SECONDS * 2 && duration - seconds <= PEEK_SECONDS;
  });
  const next = usePlayer((state) =>
    state.queue.repeat === "one" ? undefined : (state.queue.upNext[0] ?? contextUpcoming(state.queue)[0]),
  );
  if (!nearEnd || !next) return null;
  return (
    <div
      role="status"
      className="absolute right-4 bottom-full mb-2 flex max-w-80 items-center gap-2.5 border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md"
    >
      <Cover id={next.song.coverArt} size={32} className="size-7 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-[10.5px] text-faint">up next</span>
        <span className="truncate text-xs">
          {next.song.title}
          {next.song.artist && <span className="text-muted-foreground"> · {next.song.artist}</span>}
        </span>
      </span>
      <Button variant="ghost" size="xs" className="shrink-0 font-mono" onClick={() => player.remove(next)}>
        skip it
      </Button>
    </div>
  );
}

export function PlayerBar({ panel, onPanel }: { panel: Panel; onPanel: (panel: Panel) => void }) {
  const controller = useEngineController();
  const song = usePlayer(currentSong);
  const shuffle = usePlayer((state) => state.queue.shuffle);
  const repeat = usePlayer((state) => state.queue.repeat);
  const buffering = usePlayer((state) => state.buffering);
  const duration = usePlayer((state) => state.duration);
  // A spinner only when buffering drags on; short waits just pulse the seek track.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!buffering) return setSlow(false);
    const id = setTimeout(() => setSlow(true), 1000);
    return () => clearTimeout(id);
  }, [buffering]);
  const error = usePlayer((state) => state.error);
  const cached = useCachedIds();
  const songId = usePlayer((state) => currentSong(state)?.id ?? "");
  const offline = cached.has(songId);
  if (!song) return null;

  return (
    <footer className="relative shrink-0 border-t bg-background">
      <UpNextPeek />
      <AudioPlayer
        player={controller}
        shortcuts={false}
        onPrevious={player.previous}
        onNext={player.next}
        className="grid h-16 grid-cols-[minmax(0,1fr)_minmax(320px,1.4fr)_minmax(0,1fr)] gap-4 px-3.5"
      >
        <NowPlaying song={song} />

        <div className="flex flex-col gap-0.5">
          <AudioPlayerControls className="justify-center gap-2.5">
            <Hint label="shuffle" shortcut="shuffle">
              <ToolButton on={shuffle} onClick={player.toggleShuffle} aria-label="shuffle" aria-pressed={shuffle}>
                <ShuffleIcon />
              </ToolButton>
            </Hint>
            <Hint label="previous" shortcut="previous">
              <AudioPlayerPrevious className={ICON_BUTTON} aria-label="previous">
                <SkipBackIcon className="fill-current" />
              </AudioPlayerPrevious>
            </Hint>
            <Hint label={controller.playing ? "pause" : "play"} shortcut="play-pause">
              <AudioPlayerPlay className="size-8 rounded-none" aria-label={controller.playing ? "pause" : "play"}>
                {({ playing }) =>
                  slow ? (
                    <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                  ) : playing ? (
                    <PauseIcon className="fill-current" />
                  ) : (
                    <PlayIcon className="fill-current" />
                  )
                }
              </AudioPlayerPlay>
            </Hint>
            <Hint label="next" shortcut="next">
              <AudioPlayerNext className={ICON_BUTTON} aria-label="next">
                <SkipForwardIcon className="fill-current" />
              </AudioPlayerNext>
            </Hint>
            <Hint label={`repeat: ${repeat}`} shortcut="repeat">
              <ToolButton on={repeat !== "off"} onClick={player.cycleRepeat} aria-label={`repeat ${repeat}`}>
                {repeat === "one" ? <Repeat1Icon /> : <RepeatIcon />}
              </ToolButton>
            </Hint>
          </AudioPlayerControls>
          <div className="flex items-center gap-2.5">
            <Elapsed />
            <div className="relative flex flex-1 items-center">
              <AudioPlayerSeek aria-label="seek" className={cn(buffering && "animate-pulse motion-reduce:animate-none")} />
              <Suspense>
                <MomentTicks songId={song?.id} duration={duration} />
              </Suspense>
            </div>
            <AudioPlayerTime type="duration" className="w-11 text-left text-[11px]" />
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1">
          {error ? (
            <span className="mr-2 flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-destructive">
              <span className="truncate" title={error}>
                {error}
              </span>
              <Button variant="link" size="xs" className="h-auto p-0 font-mono text-[11px]" onClick={player.retry}>
                retry
              </Button>
            </span>
          ) : (
            <span className="mr-2 truncate font-mono text-[11px] text-muted-foreground">
              {offline && !buffering && <OfflineMark />}
              {buffering ? "loading…" : quality(song.suffix, song.bitRate)}
            </span>
          )}
          <Hint label="lyrics" shortcut="lyrics">
            <ToolButton on={panel === "lyrics"} onClick={() => onPanel(panel === "lyrics" ? null : "lyrics")} aria-label="lyrics">
              <MicVocalIcon />
            </ToolButton>
          </Hint>
          <Hint label="song info" shortcut="info">
            <ToolButton on={panel === "info"} onClick={() => onPanel(panel === "info" ? null : "info")} aria-label="song info">
              <InfoIcon />
            </ToolButton>
          </Hint>
          {MINI_PLAYER_SUPPORTED && (
            <Hint label="mini player" shortcut="mini-player">
              <ToolButton on={false} onClick={() => void openMiniPlayer()} aria-label="mini player">
                <PictureInPicture2Icon />
              </ToolButton>
            </Hint>
          )}
          <Hint label="queue" shortcut="queue">
            <ToolButton on={panel === "queue"} onClick={() => onPanel(panel === "queue" ? null : "queue")} aria-label="queue">
              <ListMusicIcon />
            </ToolButton>
          </Hint>
          <Suspense fallback={<SleepFallback />}>
            <SleepMenu />
          </Suspense>
          {CAN_PICK_OUTPUT && (
            <Suspense fallback={<OutputDeviceFallback />}>
              <OutputDevice />
            </Suspense>
          )}
          <AudioPlayerVolume className="w-32">
            <Hint label={controller.muted ? "unmute" : `mute · volume ${Math.round(controller.volume * 100)}%`} shortcut="mute">
              <VolumeControlMute className="size-8">
                {controller.muted || controller.volume === 0 ? (
                  <VolumeXIcon />
                ) : controller.volume < 0.5 ? (
                  <Volume1Icon />
                ) : (
                  <Volume2Icon />
                )}
              </VolumeControlMute>
            </Hint>
            <VolumeControlSlider />
          </AudioPlayerVolume>
        </div>
      </AudioPlayer>
    </footer>
  );
}
