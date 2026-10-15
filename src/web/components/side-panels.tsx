import { queryOptions, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ListPlusIcon, XIcon } from "lucide-react";
import { type FormEvent, Fragment, lazy, memo, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { current as currentDrag, dropFailed, dropSongs, endDrag, leftTarget, startDrag } from "@/lib/drag";
import { clock, quality } from "@/lib/format";
import { closeListFilter, songMatches, useListFilter } from "@/lib/list-filter";
import { focusWhenRendered, type ListCommand, useListNav } from "@/lib/list-nav";
import { currentSong, type Entry, player, usePlayer } from "@/lib/player";
import { queries, queryClient } from "@/lib/queries";
import { contextUpcoming, type Queue } from "@/lib/queue";
import { api } from "@/lib/subsonic";
import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Cover } from "./cover";
import { Hint } from "./hint";
import { ListContextMenu } from "./item-menu";
import { EmptyState } from "./library";
import { Link } from "./link";
import { ListFilterBar } from "./list-filter-bar";
import { LyricsView } from "./lyrics-view";
import { Truncated } from "./truncated";

const RadioControls = lazy(() => import("./radio-controls").then((module) => ({ default: module.RadioControls })));

function PanelFrame({
  title,
  meta,
  actions,
  onClose,
  children,
}: {
  title: string;
  meta?: string;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col" aria-label={title}>
      <header className="flex h-11 shrink-0 items-center gap-2.5 border-b pr-2 pl-3.5">
        <h2 className="font-medium font-mono text-[13px]">{title}</h2>
        <span className="flex-1 font-mono text-muted-foreground text-xs">{meta}</span>
        {actions}
        <Hint label={`close ${title}`} shortcut="close">
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={`close ${title}`}>
            <XIcon />
          </Button>
        </Hint>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-1.5 pb-4">{children}</div>
      </ScrollArea>
    </aside>
  );
}

const QUEUE_ROW = 40;
const QUEUE_HEADER = 36;

type QueueItem =
  | { kind: "header"; label: string; action?: { label: string; run: () => void } }
  | { kind: "entry"; entry: Entry; state: "played" | "current" | "next" };

const QueueRow = memo(function QueueRow({ entry, state }: { entry: Entry; state: "played" | "current" | "next" }) {
  const { song } = entry;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drag source wrapper; the buttons inside are the controls
    <div
      className={cn("group/queue flex h-10 items-center", state === "played" && "opacity-45")}
      // Upcoming songs can be dragged to another place in the queue, or onto a playlist.
      draggable={state === "next"}
      onDragStart={(event) => startDrag(event, { kind: "songs", songs: [song] }, { list: "queue", index: -1, key: entry.uid })}
      onDragEnd={endDrag}
    >
      <button
        type="button"
        className={cn(
          "grid min-w-0 flex-1 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 px-1.5 py-1 text-left hover:bg-card",
          state === "current" && "bg-border hover:bg-border",
        )}
        onClick={() => state === "next" && player.jumpTo(entry)}
        // Not `disabled`: played and current rows stay focusable for keyboard navigation.
        aria-disabled={state !== "next"}
      >
        <Cover id={song.coverArt} size={32} />
        <span className="flex min-w-0 flex-col">
          <Truncated text={song.title} />
          <span className="truncate text-muted-foreground text-xs">{song.artist}</span>
        </span>
        <span className="font-mono text-muted-foreground text-xs tabular-nums">{clock(song.duration)}</span>
      </button>
      {state === "next" && (
        <Hint label="remove from the queue" shortcut="list-remove">
          <Button
            variant="ghost"
            size="icon-sm"
            className="opacity-0 focus-visible:opacity-100 group-hover/queue:opacity-100"
            onClick={() => player.remove(entry)}
            aria-label={`remove ${song.title}`}
          >
            <XIcon />
          </Button>
        </Hint>
      )}
    </div>
  );
});

/** Now playing, then your queue, then the rest of the context, with the last few played above, dimmed. */
function queueItems(queue: Queue): QueueItem[] {
  const items: QueueItem[] = [];
  const recent = queue.history.slice(-20);
  if (recent.length)
    items.push(
      { kind: "header", label: "played" },
      ...recent.map((entry) => ({ kind: "entry" as const, entry, state: "played" as const })),
    );
  if (queue.current) items.push({ kind: "header", label: "now playing" }, { kind: "entry", entry: queue.current, state: "current" });
  if (queue.upNext.length)
    items.push(
      { kind: "header", label: "next in your queue", action: { label: "clear", run: player.clearUpNext } },
      ...queue.upNext.map((entry) => ({ kind: "entry" as const, entry, state: "next" as const })),
    );
  const upcoming = contextUpcoming(queue);
  if (upcoming.length)
    items.push(
      {
        kind: "header",
        label: queue.context.source ? `next from ${queue.context.source.name}` : "next up",
        action: { label: "clear", run: player.clearContext },
      },
      ...upcoming.map((entry) => ({ kind: "entry" as const, entry, state: "next" as const })),
    );
  return items;
}

/** Saves what's playing and everything still to come as a playlist (shows up in Arpeggi too). */
function SaveQueue() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    setState("saving");
    try {
      await player.saveAsPlaylist(name.trim());
      await queryClient.invalidateQueries({ queryKey: queries.playlists().queryKey });
      setOpen(false);
      setState("idle");
    } catch {
      setState("failed");
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(`queue · ${new Date().toLocaleDateString(undefined, { dateStyle: "medium" })}`);
      }}
    >
      <Hint label="save as playlist">
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="save queue as playlist" />}>
          <ListPlusIcon />
        </DialogTrigger>
      </Hint>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-mono">save queue as playlist</DialogTitle>
          <DialogDescription>the playing song and everything after it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-3">
          <Input aria-label="playlist name" value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
          {state === "failed" && <p className="text-destructive text-xs">couldn't save, try again</p>}
          <Button type="submit" disabled={state === "saving" || !name.trim()}>
            {state === "saving" ? "saving…" : "save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const queue = usePlayer((state) => state.queue);
  const [dropping, setDropping] = useState(false);
  const filter = useListFilter("queue");
  useEffect(() => () => closeListFilter("queue"), []);
  const items = useMemo(() => {
    const all = queueItems(queue);
    if (!filter) return all;
    // Headers stay so you still see which part of the queue a match is in.
    return all.filter((item) => item.kind !== "entry" || songMatches(item.entry.song, filter));
  }, [queue, filter]);
  const upcoming = queue.upNext.length + Math.max(0, queue.context.order.length - queue.context.cursor - 1);
  const currentIndex = items.findIndex((item) => item.kind === "entry" && item.state === "current");
  const listRef = useRef<HTMLOListElement>(null);
  // A shuffled library is thousands of rows: only the visible ones render, inside the panel's scroll area.
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current?.closest<HTMLElement>("[data-slot=scroll-area-viewport]") ?? null,
    estimateSize: (index) => (items[index]?.kind === "header" ? QUEUE_HEADER : QUEUE_ROW),
    overscan: 10,
    scrollMargin: listRef.current?.offsetTop ?? 6,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: start at the playing song when the panel opens, not on every change
  useEffect(() => {
    if (currentIndex > 0) virtualizer.scrollToIndex(currentIndex - 1, { align: "start" });
  }, []);
  const margin = virtualizer.options.scrollMargin;

  // Keyboard: j/k move, enter jumps, delete removes, alt+↑/↓ reorders (#28).
  const entryIndexes = items.flatMap((item, index) => (item.kind === "entry" ? [index] : []));
  const focusRow = (index: number) => {
    virtualizer.scrollToIndex(index, { align: "auto" });
    focusWhenRendered(() => listRef.current?.querySelector<HTMLElement>(`[data-queue-index="${index}"] button`) ?? null);
  };
  const handler = (command: ListCommand): boolean => {
    const current = Number(document.activeElement?.closest("[data-queue-index]")?.getAttribute("data-queue-index") ?? -1);
    const item = items[current];
    const position = entryIndexes.indexOf(current);
    const step = (delta: number) => entryIndexes[Math.max(0, Math.min(entryIndexes.length - 1, position + delta))];
    switch (command) {
      case "down":
      case "up": {
        const target = position < 0 ? entryIndexes[0] : step(command === "down" ? 1 : -1);
        if (target !== undefined) focusRow(target);
        return true;
      }
      case "first":
      case "last": {
        const target = command === "first" ? entryIndexes[0] : entryIndexes.at(-1);
        if (target !== undefined) focusRow(target);
        return true;
      }
      case "play":
        if (item?.kind !== "entry" || item.state !== "next") return false;
        player.jumpTo(item.entry);
        return true;
      case "remove":
        if (item?.kind !== "entry" || item.state !== "next") return false;
        player.remove(item.entry);
        // Stay on the row that slid into this place.
        focusRow(current);
        return true;
      case "move-up":
      case "move-down": {
        if (item?.kind !== "entry" || item.state !== "next") return false;
        const delta = command === "move-up" ? -1 : 1;
        player.move(item.entry, delta);
        focusRow(current + delta);
        return true;
      }
      default:
        return false;
    }
  };

  const listNav = useListNav(handler);

  return (
    <PanelFrame title="queue" meta={`${upcoming} up next`} onClose={onClose} actions={queue.current && <SaveQueue />}>
      <Suspense>
        <RadioControls />
      </Suspense>
      {/* A list, not a listbox: rows hold their own buttons (jump, remove), which options can't contain. */}
      <div data-filter-scope="queue">
        {filter !== null && (
          <ListFilterBar
            scope="queue"
            query={filter}
            shown={items.filter((item) => item.kind === "entry").length}
            total={queueItems(queue).filter((item) => item.kind === "entry").length}
          />
        )}
        <ListContextMenu
          resolve={(element) => {
            const item = items[Number(element.closest("[data-queue-index]")?.getAttribute("data-queue-index") ?? Number.NaN)];
            return item?.kind === "entry" ? { kind: "songs", songs: [item.entry.song] } : null;
          }}
        >
          <ol
            ref={listRef}
            aria-label="queue"
            className="relative data-drop-target:outline data-drop-target:outline-foreground data-drop-target:-outline-offset-1"
            style={{ height: virtualizer.getTotalSize() }}
            data-drop-target={dropping || undefined}
            {...listNav}
            onDragOver={(event) => {
              const drag = currentDrag(event);
              if (!drag) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = drag.reorder?.list === "queue" ? "move" : "copy";
              setDropping(drag.reorder?.list !== "queue");
            }}
            onDragLeave={(event) => leftTarget(event) && setDropping(false)}
            onDrop={(event) => {
              const drag = currentDrag(event);
              setDropping(false);
              if (!drag) return;
              event.preventDefault();
              endDrag();
              if (drag.reorder?.list === "queue") {
                // Dropped on another upcoming song: take its place.
                const over =
                  items[Number((event.target as Element).closest("[data-queue-index]")?.getAttribute("data-queue-index") ?? Number.NaN)];
                const from = queueItems(queue).find((item) => item.kind === "entry" && item.entry.uid === drag.reorder?.key);
                if (over?.kind === "entry" && over.state === "next" && from?.kind === "entry") player.moveTo(from.entry, over.entry);
                return;
              }
              void dropSongs(drag.target)
                .then((songs) => player.addToQueue(songs))
                .catch(dropFailed);
            }}
          >
            {virtualizer.getVirtualItems().map((virtual) => {
              const item = items[virtual.index];
              if (!item) return null;
              return (
                <li
                  key={item.kind === "entry" ? item.entry.uid : `h-${item.label}`}
                  aria-current={item.kind === "entry" && item.state === "current" ? "true" : undefined}
                  data-queue-index={item.kind === "entry" ? virtual.index : undefined}
                  className="absolute inset-x-0"
                  style={{ transform: `translateY(${virtual.start - margin}px)` }}
                >
                  {item.kind === "header" ? (
                    <div className="flex h-9 items-end justify-between px-1.5 pb-1.5">
                      <h3 className="truncate font-mono text-[10.5px] text-faint">{item.label}</h3>
                      {item.action && (
                        <Button
                          variant="link"
                          size="xs"
                          className="h-auto p-0 font-mono text-[10.5px] text-muted-foreground"
                          onClick={item.action.run}
                        >
                          {item.action.label}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <QueueRow entry={item.entry} state={item.state} />
                  )}
                </li>
              );
            })}
          </ol>
        </ListContextMenu>
        {upcoming === 0 && filter === null && <NothingNext />}
      </div>
    </PanelFrame>
  );
}

/** The end of the queue: a mix from the whole library keeps it going. */
function NothingNext() {
  const [loading, setLoading] = useState(false);
  return (
    <Empty className="p-6">
      <EmptyHeader>
        <EmptyTitle className="font-mono text-xs">nothing up next</EmptyTitle>
        <EmptyDescription className="font-mono text-[11px]">music stops after this song</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void queryClient
              .fetchQuery({ ...queries.randomSongs(50), staleTime: 0 })
              .then((songs) => player.addToQueue(songs))
              .finally(() => setLoading(false));
          }}
        >
          keep going with a random mix
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function LyricsPanel({ onClose }: { onClose: () => void }) {
  const song = usePlayer(currentSong);
  return (
    <PanelFrame title="lyrics" onClose={onClose}>
      {song ? <LyricsView key={song.id} song={song} size="panel" /> : <EmptyState>nothing playing</EmptyState>}
    </PanelFrame>
  );
}

/** What getSong says about a file beyond what lists carry (OpenSubsonic fields where the server has them). */
interface SongDetails extends Song {
  path?: string;
  parent?: string;
  played?: string;
  bitDepth?: number;
  samplingRate?: number;
  channelCount?: number;
  musicBrainzId?: string;
  displayComposer?: string;
  contributors?: { role: string; subRole?: string; artist: { name: string } }[];
}

const songDetails = (id: string) =>
  queryOptions({
    queryKey: ["song", id],
    queryFn: () => api<{ song: SongDetails }>("getSong", { id }).then((response) => response.song),
    staleTime: 60_000,
  });

function Facts({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!shown.length) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="font-mono text-[10.5px] text-faint">{title}</h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[12.5px]">
        {shown.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 [overflow-wrap:anywhere]">{value}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

const megabytes = (bytes?: number) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : undefined);
const db = (value?: number) => (value === undefined ? undefined : `${value > 0 ? "+" : ""}${value.toFixed(2)} dB`);

/** `i`: everything about the playing song: credits, the file, your plays, ReplayGain, where it lives. */
export function InfoPanel({ onClose }: { onClose: () => void }) {
  const current = usePlayer(currentSong);
  const { data } = useQuery({ ...songDetails(current?.id ?? ""), enabled: Boolean(current) });
  const song = data ?? current;
  if (!song)
    return (
      <PanelFrame title="info" onClose={onClose}>
        <EmptyState>nothing playing</EmptyState>
      </PanelFrame>
    );
  const details = song as SongDetails;
  const credits = (details.contributors ?? []).map((credit): [string, ReactNode] => [credit.subRole ?? credit.role, credit.artist.name]);
  const rg = song.replayGain;
  return (
    <PanelFrame title="info" onClose={onClose}>
      <div className="flex flex-col gap-5 px-3.5 py-3">
        <Facts
          title="credits"
          rows={[
            ["artist", song.artist],
            ["album", song.album],
            ["composer", details.displayComposer],
            ...credits,
            ["year", song.year],
            ["disc · track", song.track ? `${song.discNumber ?? 1} · ${song.track}` : undefined],
            ["genre", song.genre],
          ]}
        />
        <Facts
          title="file"
          rows={[
            ["format", quality(song.suffix, song.bitRate)],
            ["bit depth", details.bitDepth ? `${details.bitDepth} bit` : undefined],
            ["sample rate", details.samplingRate ? `${(details.samplingRate / 1000).toFixed(1)} kHz` : undefined],
            ["channels", details.channelCount],
            ["size", megabytes(song.size)],
            ["path", details.path && <span className="font-mono text-[11px]">{details.path}</span>],
          ]}
        />
        <Facts
          title="you"
          rows={[
            ["plays", song.playCount ?? 0],
            [
              "last played",
              details.played ? new Date(details.played).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : undefined,
            ],
          ]}
        />
        <Facts
          title="replaygain"
          rows={[
            ["track", db(rg?.trackGain)],
            ["album", db(rg?.albumGain)],
            ["track peak", rg?.trackPeak?.toFixed(3)],
          ]}
        />
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]">
          {details.parent && (
            <Link href={`/folders/${encodeURIComponent(details.parent)}`} className="underline-offset-3 hover:underline">
              open folder
            </Link>
          )}
          {details.musicBrainzId && (
            <a
              href={`https://musicbrainz.org/recording/${details.musicBrainzId}`}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-3 hover:underline"
            >
              musicbrainz
            </a>
          )}
        </div>
      </div>
    </PanelFrame>
  );
}
