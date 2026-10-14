import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { XIcon } from "lucide-react";
import { memo, type ReactNode, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { clock } from "@/lib/format";
import { currentSong, player, usePlayer, usePosition } from "@/lib/player";
import { queries } from "@/lib/queries";
import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Cover } from "./cover";
import { EmptyState } from "./library";

function PanelFrame({ title, meta, onClose, children }: { title: string; meta?: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="flex h-full min-h-0 flex-col" aria-label={title}>
      <header className="flex h-11 shrink-0 items-center gap-2.5 border-b pr-2 pl-3.5">
        <h2 className="font-medium font-mono text-[13px]">{title}</h2>
        <span className="flex-1 font-mono text-muted-foreground text-xs">{meta}</span>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={`close ${title}`}>
          <XIcon />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-1.5 pb-4">{children}</div>
      </ScrollArea>
    </aside>
  );
}

const QUEUE_ROW = 40;

const QueueRow = memo(function QueueRow({ song, index, state }: { song: Song; index: number; state: "played" | "current" | "next" }) {
  return (
    <div className={cn("group/queue flex h-10 items-center", state === "played" && "opacity-45")}>
      <button
        type="button"
        className={cn(
          "grid min-w-0 flex-1 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 px-1.5 py-1 text-left hover:bg-card",
          state === "current" && "bg-border hover:bg-border",
        )}
        onClick={() => player.jumpTo(index)}
      >
        <Cover id={song.coverArt} size={32} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{song.title}</span>
          <span className="truncate text-muted-foreground text-xs">{song.artist}</span>
        </span>
        <span className="font-mono text-muted-foreground text-xs tabular-nums">{clock(song.duration)}</span>
      </button>
      {state !== "current" && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="opacity-0 focus-visible:opacity-100 group-hover/queue:opacity-100"
          onClick={() => player.remove(index)}
          aria-label={`remove ${song.title}`}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
});

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const queue = usePlayer((state) => state.queue);
  const current = usePlayer((state) => state.index);
  const upcoming = queue.length - current - 1;
  const listRef = useRef<HTMLOListElement>(null);
  // A shuffled library is thousands of rows: only the visible ones render, inside the panel's scroll area.
  const virtualizer = useVirtualizer({
    count: queue.length,
    getScrollElement: () => listRef.current?.closest<HTMLElement>("[data-slot=scroll-area-viewport]") ?? null,
    estimateSize: () => QUEUE_ROW,
    overscan: 10,
    scrollMargin: listRef.current?.offsetTop ?? 6,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: center the playing song when the panel opens, not on every change
  useEffect(() => {
    if (current > 0) virtualizer.scrollToIndex(current, { align: "center" });
  }, []);
  const margin = virtualizer.options.scrollMargin;

  return (
    <PanelFrame title="queue" meta={`${upcoming} up next`} onClose={onClose}>
      <ol ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const song = queue[item.index];
          if (!song) return null;
          return (
            <li key={item.key} className="absolute inset-x-0" style={{ transform: `translateY(${item.start - margin}px)` }}>
              <QueueRow
                song={song}
                index={item.index}
                state={item.index < current ? "played" : item.index === current ? "current" : "next"}
              />
            </li>
          );
        })}
      </ol>
      {queue.length > 0 && (
        <Button variant="link" size="xs" className="mt-3.5 ml-2 px-0 font-mono text-muted-foreground" onClick={player.clear}>
          clear queue
        </Button>
      )}
    </PanelFrame>
  );
}

export function LyricsPanel({ onClose }: { onClose: () => void }) {
  const song = usePlayer(currentSong);
  const { data, isPending: loading } = useQuery({ ...queries.lyrics(song?.id ?? ""), enabled: Boolean(song) });
  const lyrics = useMemo(() => {
    const all = data ?? [];
    return all.find((entry) => entry.synced) ?? all[0];
  }, [data]);

  // Re-renders only when the active line changes, not every frame.
  const active = usePosition((seconds) => (lyrics?.synced ? lyrics.line.findLastIndex((line) => (line.start ?? 0) <= seconds * 1000) : -1));
  const activeRef = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll only when the active line changes
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  return (
    <PanelFrame title="lyrics" meta={lyrics ? (lyrics.synced ? "synced" : "plain") : undefined} onClose={onClose}>
      {!song ? (
        <EmptyState>nothing playing</EmptyState>
      ) : loading && !lyrics ? (
        <EmptyState>loading…</EmptyState>
      ) : !lyrics?.line.length ? (
        <EmptyState>no lyrics for this track</EmptyState>
      ) : lyrics.synced ? (
        <div className="flex flex-col gap-1.5 px-2 py-3 font-medium text-[17px] leading-[1.35] tracking-tight">
          {lyrics.line.map((line, index) => (
            <button
              type="button"
              // Lines repeat (choruses), so the index is the identity.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              key={index}
              ref={index === active ? activeRef : undefined}
              className={cn(
                "text-left text-faint transition-colors duration-200 hover:text-foreground",
                index < active && "text-muted-foreground",
                index === active && "text-foreground",
              )}
              onClick={() => line.start !== undefined && player.seek(line.start / 1000)}
            >
              {line.value || " "}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 px-2 py-3 font-medium text-[17px] leading-[1.35] tracking-tight">
          {lyrics.line.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: plain lyrics have no ids and repeat
            <p key={index}>{line.value || " "}</p>
          ))}
        </div>
      )}
    </PanelFrame>
  );
}
