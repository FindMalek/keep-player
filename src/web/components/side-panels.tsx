import { XIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { clock } from "@/lib/format";
import { currentSong, player, usePlayer } from "@/lib/player";
import { api } from "@/lib/subsonic";
import type { StructuredLyrics } from "@/lib/types";
import { useQuery } from "@/lib/use-query";
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

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const state = usePlayer();
  const upcoming = state.queue.length - state.index - 1;

  return (
    <PanelFrame title="queue" meta={`${upcoming} up next`} onClose={onClose}>
      <ol>
        {state.queue.map((song, index) => (
          // The queue can hold the same song twice.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <li key={`${song.id}-${index}`} className={cn("group/queue flex items-center", index < state.index && "opacity-45")}>
            <button
              type="button"
              className={cn(
                "grid min-w-0 flex-1 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 px-1.5 py-1 text-left hover:bg-card",
                index === state.index && "bg-border hover:bg-border",
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
            {index !== state.index && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 group-hover/queue:opacity-100 focus-visible:opacity-100"
                onClick={() => player.remove(index)}
                aria-label={`remove ${song.title}`}
              >
                <XIcon />
              </Button>
            )}
          </li>
        ))}
      </ol>
      {state.queue.length > 0 && (
        <Button variant="link" size="xs" className="mt-3.5 ml-2 px-0 font-mono text-muted-foreground" onClick={player.clear}>
          clear queue
        </Button>
      )}
    </PanelFrame>
  );
}

export function LyricsPanel({ onClose }: { onClose: () => void }) {
  const state = usePlayer();
  const song = currentSong(state);
  const { data, loading } = useQuery(song ? `lyrics:${song.id}` : null, () =>
    api<{ lyricsList?: { structuredLyrics?: StructuredLyrics[] } }>("getLyricsBySongId", { id: song?.id }),
  );
  const lyrics = useMemo(() => {
    const all = data?.lyricsList?.structuredLyrics ?? [];
    return all.find((entry) => entry.synced) ?? all[0];
  }, [data]);

  const positionMs = state.position * 1000;
  const active = lyrics?.synced ? lyrics.line.findLastIndex((line) => (line.start ?? 0) <= positionMs) : -1;
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
