import { Button } from "@keep/ui/components/button";
import {
  EllipsisIcon,
  InfoIcon,
  ListMusicIcon,
  MicVocalIcon,
  PauseIcon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
import { VolumeControlMute, VolumeControlSlider } from "@/components/ui/volume-control";
import { type BarMode, useBarMode } from "@/lib/bar-mode";
import { dropTarget } from "@/lib/drag";
import { useEngineController } from "@/lib/engine-controller";
import { quality } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useCachedIds } from "@/lib/offline";
import { currentSong, player, usePlayer, usePosition } from "@/lib/player";
import { contextUpcoming } from "@/lib/queue";
import { useSession } from "@/lib/session-state";
import { useSetting } from "@/lib/settings";
import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Cover } from "./cover";
import { Hint } from "./hint";
import { LikeButton } from "./like-button";
import { Link } from "./link";
import { Loader } from "./loader";
import { OfflineMark } from "./offline-mark";
import { ToolButton } from "./tool-button";
import { Truncated } from "./truncated";

export type Panel = "queue" | "lyrics" | "info" | null;

const ICON_BUTTON = "size-8 rounded-none text-muted-foreground hover:bg-transparent hover:text-foreground";

/** audiocn's time readout reads the live position; this re-renders it once a second instead of every frame. */
function Elapsed() {
  usePosition(Math.floor);
  return <AudioPlayerTime className="w-11 text-meta" />;
}

const MomentTicks = lazy(() => import("./moment-ticks").then((module) => ({ default: module.MomentTicks })));

// Hover cards only matter on hover: they load after the first screen, with the same markup until then.
const CoverDetails = lazy(() => import("./now-playing-details").then((module) => ({ default: module.CoverDetails })));
const ArtistCard = lazy(() => import("./artist-card").then((module) => ({ default: module.ArtistCard })));

/** Title, artist and like; song info is a small button on the cover, shown when you hover it. */
function NowPlaying({ song, panel, onPanel }: { song: Song; panel: Panel; onPanel: (panel: Panel) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="group/cover relative shrink-0">
        <Suspense fallback={<Cover id={song.coverArt} size={42} className="size-10.5 shrink-0" priority />}>
          <CoverDetails song={song} />
        </Suspense>
        <button
          type="button"
          aria-label="song info"
          aria-pressed={panel === "info"}
          onClick={() => onPanel(panel === "info" ? null : "info")}
          className="absolute top-0.5 right-0.5 hidden size-4 items-center justify-center bg-background text-foreground group-hover/cover:flex focus-visible:flex aria-pressed:flex [&_svg]:size-3"
        >
          <InfoIcon />
        </button>
      </div>
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
  const enabled = useSetting("upNext");
  const nearEnd = usePosition((seconds) => {
    const { duration } = player.getState();
    return duration > PEEK_SECONDS * 2 && duration - seconds <= PEEK_SECONDS;
  });
  const next = usePlayer((state) =>
    state.queue.repeat === "one" ? undefined : (state.queue.upNext[0] ?? contextUpcoming(state.queue)[0]),
  );
  if (!enabled || !nearEnd || !next) return null;
  return (
    <div
      role="status"
      className="absolute right-4 bottom-full mb-2 flex max-w-80 items-center gap-2.5 border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md"
    >
      <Cover id={next.song.coverArt} size={32} className="size-7 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-label text-faint">up next</span>
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

/** Per-mode shape of the bar's grid. Full and laptop share three columns; mobile stacks the seek bar below. */
const BAR_GRID: Record<BarMode, string> = {
  full: "grid h-16 grid-cols-[minmax(0,1fr)_minmax(320px,1.4fr)_minmax(0,1fr)] gap-4 px-3.5",
  laptop: "grid h-16 grid-cols-[minmax(0,1fr)_minmax(300px,1.4fr)_minmax(0,1fr)] gap-3 px-3.5",
  compact: "grid h-16 grid-cols-[minmax(0,1fr)_minmax(250px,1.3fr)_auto] gap-3 px-3",
  mobile: "grid h-auto grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 px-3 py-1.5",
};

const DevicePicker = lazy(() => import("./device-picker").then((module) => ({ default: module.DevicePicker })));

/** Next to the controls while another device plays: where the sound is coming from. */
function PlayingOn() {
  const { devices, you } = useSession();
  const active = devices.find((device) => device.active);
  if (!active || active.id === you) return null;
  return <span className="truncate font-mono text-label text-muted-foreground">playing on {active.name}</span>;
}

/** The picker loads with the menu library once there is a second device to pick. */
function Devices() {
  const { devices } = useSession();
  if (devices.length < 2) return null;
  return (
    <Suspense fallback={null}>
      <DevicePicker />
    </Suspense>
  );
}

const PlayerMore = lazy(() => import("./player-more").then((module) => ({ default: module.PlayerMore })));

function MoreFallback() {
  return (
    <ToolButton aria-label="more controls" disabled>
      <EllipsisIcon />
    </ToolButton>
  );
}

export function PlayerBar({ panel, onPanel }: { panel: Panel; onPanel: (panel: Panel) => void }) {
  const [dropping, setDropping] = useState(false);
  const mode = useBarMode();
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
  const offlineInBar = useSetting("offlineInBar");
  const footer = useRef<HTMLElement>(null);
  const hasSong = Boolean(song);
  // The rest of the layout (the sidebar's bottom edge, the selection bar) sits above the bar: tell it how tall it is.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the footer only exists once there is a song, so look again then
  useEffect(() => {
    const element = footer.current;
    const host = element?.parentElement;
    if (!element || !host) return;
    const publish = () => host.style.setProperty("--bar-height", `${element.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasSong]);
  if (!song) return null;

  const mobile = mode === "mobile";
  const full = mode === "full";
  const roomy = mode === "full" || mode === "laptop";

  const controls = (
    <AudioPlayerControls className={cn("justify-center gap-2.5", mobile && "gap-1")}>
      {!mobile && (
        <Hint label="shuffle" shortcut="shuffle">
          <ToolButton on={shuffle} onClick={player.toggleShuffle} aria-label="shuffle" aria-pressed={shuffle}>
            <ShuffleIcon />
          </ToolButton>
        </Hint>
      )}
      {!mobile && (
        <Hint label="previous" shortcut="previous">
          <AudioPlayerPrevious className={ICON_BUTTON} aria-label="previous">
            <SkipBackIcon className="fill-current" />
          </AudioPlayerPrevious>
        </Hint>
      )}
      <Hint label={controller.playing ? "pause" : "play"} shortcut="play-pause">
        <AudioPlayerPlay className="size-8 rounded-none" aria-label={controller.playing ? "pause" : "play"}>
          {({ playing }) =>
            slow ? (
              <Loader className="size-4" label="buffering" />
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
      {!mobile && (
        <Hint label={`repeat: ${repeat}`} shortcut="repeat">
          <ToolButton on={repeat !== "off"} onClick={player.cycleRepeat} aria-label={`repeat ${repeat}`}>
            {repeat === "one" ? <Repeat1Icon /> : <RepeatIcon />}
          </ToolButton>
        </Hint>
      )}
    </AudioPlayerControls>
  );

  const seek = (
    <div className="flex min-w-0 items-center gap-2.5">
      <Elapsed />
      <div className="relative flex flex-1 items-center">
        <AudioPlayerSeek aria-label="seek" className={cn(buffering && "opacity-60")} />
        <Suspense>
          <MomentTicks songId={song?.id} duration={duration} />
        </Suspense>
      </div>
      <AudioPlayerTime type="duration" className="w-11 text-left text-meta" />
    </div>
  );

  const queueButton = (
    <Hint label="queue" shortcut="queue">
      <ToolButton on={panel === "queue"} onClick={() => onPanel(panel === "queue" ? null : "queue")} aria-label="queue">
        <ListMusicIcon />
      </ToolButton>
    </Hint>
  );

  const more = (
    <Suspense fallback={<MoreFallback />}>
      <PlayerMore mode={mode} panel={panel} onPanel={onPanel} />
    </Suspense>
  );

  const status = error ? (
    <span className="mr-2 flex min-w-0 items-center gap-1.5 font-mono text-meta text-destructive">
      <span className="truncate" title={error}>
        {error}
      </span>
      <Button variant="link" size="xs" className="h-auto p-0 font-mono text-meta" onClick={player.retry}>
        retry
      </Button>
    </span>
  ) : roomy ? (
    <span className="mr-2 truncate font-mono text-meta text-muted-foreground">
      {offline && offlineInBar && !buffering && <OfflineMark />}
      {buffering ? "loading…" : quality(song.suffix, song.bitRate)}
    </span>
  ) : null;

  return (
    <footer
      ref={footer}
      className="relative shrink-0 border-t bg-background data-drop-target:bg-card data-drop-target:outline data-drop-target:outline-foreground data-drop-target:-outline-offset-1"
      data-bar={mode}
      data-drop-target={dropping || undefined}
      // Drop songs here to play them next.
      {...dropTarget((songs) => {
        player.playNext(songs);
        notify({ message: songs.length === 1 ? `${songs[0]?.title} plays next` : `${songs.length} songs play next` });
      }, setDropping)}
    >
      <UpNextPeek />
      <AudioPlayer player={controller} shortcuts={false} onPrevious={player.previous} onNext={player.next} className={BAR_GRID[mode]}>
        <NowPlaying song={song} panel={panel} onPanel={onPanel} />

        {mobile ? (
          <>
            <div className="flex items-center justify-end gap-0.5">
              {controls}
              <Devices />
              {queueButton}
              {more}
            </div>
            <div className="col-span-2">{seek}</div>
            {error && <div className="col-span-2 flex">{status}</div>}
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-col gap-0.5">
              {controls}
              {seek}
            </div>

            <div className="flex min-w-0 items-center justify-end gap-1">
              <PlayingOn />
              {status}
              <Hint label="lyrics" shortcut="lyrics">
                <ToolButton on={panel === "lyrics"} onClick={() => onPanel(panel === "lyrics" ? null : "lyrics")} aria-label="lyrics">
                  <MicVocalIcon />
                </ToolButton>
              </Hint>
              <Devices />
              {queueButton}
              {more}
              <AudioPlayerVolume className={cn(roomy ? (full ? "w-32" : "w-28") : "w-8")}>
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
                {roomy && <VolumeControlSlider />}
              </AudioPlayerVolume>
            </div>
          </>
        )}
      </AudioPlayer>
    </footer>
  );
}
