import { useVirtualizer } from "@tanstack/react-virtual";
import { ListPlusIcon, XIcon } from "lucide-react";
import { type FormEvent, memo, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { clock } from "@/lib/format";
import { closeListFilter, songMatches, useListFilter } from "@/lib/list-filter";
import { focusWhenRendered, type ListCommand, useListNav } from "@/lib/list-nav";
import { currentSong, type Entry, player, usePlayer } from "@/lib/player";
import { queries, queryClient } from "@/lib/queries";
import { contextUpcoming, type Queue } from "@/lib/queue";
import { cn } from "@/lib/utils";
import { Cover } from "./cover";
import { Hint } from "./hint";
import { EmptyState } from "./library";
import { ListFilterBar } from "./list-filter-bar";
import { LyricsView } from "./lyrics-view";
import { Truncated } from "./truncated";

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
    <div className={cn("group/queue flex h-10 items-center", state === "played" && "opacity-45")}>
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
        <ol ref={listRef} aria-label="queue" className="relative" style={{ height: virtualizer.getTotalSize() }} {...listNav}>
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
      </div>
    </PanelFrame>
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
