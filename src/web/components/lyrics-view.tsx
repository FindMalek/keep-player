import { useQuery } from "@tanstack/react-query";
import { CopyIcon, ExternalLinkIcon, LanguagesIcon, LocateFixedIcon, Share2Icon } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiQueries } from "@/lib/api-queries";
import { clock } from "@/lib/format";
import { notify } from "@/lib/notify";
import { player, usePosition } from "@/lib/player";
import { queries, queryClient } from "@/lib/queries";
import { useShortcuts } from "@/lib/shortcuts";
import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { LyricLine } from "../../shared/lyrics";
import { lyricsShortcuts } from "../app-shortcuts";
import { Hint } from "./hint";
import { KeyCombo } from "./key-combo";
import { EmptyState } from "./library";
import { Delayed } from "./skeletons";

type Size = "panel" | "full";
type LineState = "past" | "active" | "future";

/** Index of the line playing at `ms` (the last one that has started), by binary search. */
export function activeLine(lines: { start: number }[], ms: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((lines[middle]?.start ?? 0) <= ms) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found;
}

const NUDGE_MS = 250;
const RESUME_SCROLL_MS = 4000;
const TRANSLATION_KEY = "keep-player:lyrics-translation";

/** Word-by-word fill for the active line (Enhanced LRC): re-renders when the next word starts, not every frame. */
function Words({ words, offset }: { words: NonNullable<LyricLine["words"]>; offset: number }) {
  const sung = usePosition((seconds) => words.filter((word) => word.start + offset <= seconds * 1000).length);
  return (
    <>
      {words.map((word, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: words repeat within a line
        <span key={index} className={cn("transition-colors duration-150", index < sung ? "text-foreground" : "text-muted-foreground")}>
          {word.text}{" "}
        </span>
      ))}
    </>
  );
}

const Line = memo(function Line({
  line,
  state,
  size,
  offset,
  translation,
  song,
  lineRef,
}: {
  line: LyricLine;
  state: LineState;
  size: Size;
  offset: number;
  translation?: string;
  song: Song;
  lineRef?: (element: HTMLDivElement | null) => void;
}) {
  const quote = `“${line.text}” — ${song.title}${song.artist ? ` · ${song.artist}` : ""}`;
  return (
    <div ref={lineRef} className="group/line relative flex items-start gap-2">
      <button
        type="button"
        title={`${clock((line.start + offset) / 1000)} · click to play from here`}
        className={cn(
          "flex-1 text-left transition-colors duration-200 hover:text-foreground",
          state === "past" && "text-muted-foreground",
          state === "future" && "text-faint",
          state === "active" && "text-foreground",
        )}
        onClick={() => player.seek((line.start + offset) / 1000)}
      >
        {state === "active" && line.words ? <Words words={line.words} offset={offset} /> : line.text || " "}
        {translation && (
          <span className={cn("block font-normal text-muted-foreground", size === "full" ? "text-xl" : "text-sm")}>{translation}</span>
        )}
      </button>
      {line.text && (
        <span className="mt-1 flex shrink-0 gap-0.5 opacity-0 focus-within:opacity-100 group-hover/line:opacity-100">
          <Hint label="copy this line">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="copy this line"
              onClick={() => void navigator.clipboard.writeText(quote).then(() => notify({ message: "line copied" }))}
            >
              <CopyIcon />
            </Button>
          </Hint>
          {"share" in navigator && (
            <Hint label="share this line">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="share this line"
                onClick={() => void navigator.share({ text: quote }).catch(() => undefined)}
              >
                <Share2Icon />
              </Button>
            </Hint>
          )}
        </span>
      )}
    </div>
  );
});

function LoadingLines() {
  return (
    <Delayed>
      <div aria-hidden className="flex flex-col gap-3 px-2 py-3">
        {[70, 55, 85, 40, 65, 75, 50, 60].map((width) => (
          <Skeleton key={width} className="h-5" style={{ width: `${width}%` }} />
        ))}
      </div>
    </Delayed>
  );
}

/** Synced lyrics that follow the song, or plain ones, with every state; shared by the side panel and full screen. */
export function LyricsView({ song, size }: { song: Song; size: Size }) {
  const { data: lyrics, isPending } = useQuery(queries.lyrics(song.id));
  const synced = lyrics?.status === "synced" ? lyrics.lines : null;
  const offset = useQuery(apiQueries.lyricsOffset(song.id)).data ?? 0;
  const setOffset = (update: (current: number) => number) =>
    queryClient.setQueryData(apiQueries.lyricsOffset(song.id).queryKey, (current) => update(current ?? 0));

  const [showTranslation, setShowTranslation] = useState(() => {
    try {
      return localStorage.getItem(TRANSLATION_KEY) === "on";
    } catch {
      return false;
    }
  });
  const translation = showTranslation ? lyrics?.translations?.[0] : undefined;

  // Nudge timing with [ and ]; saved per song on the server so it follows you.
  const save = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nudge = (delta: number) => {
    if (!synced) return false;
    setOffset((current) => {
      const next = current + delta;
      clearTimeout(save.current);
      save.current = setTimeout(() => {
        void fetch(`/api/lyrics/${encodeURIComponent(song.id)}/offset`, {
          method: "PUT",
          headers: { "x-keep-player": "1", "content-type": "application/json" },
          body: JSON.stringify({ offset: next }),
        });
      }, 600);
      return next;
    });
    return true;
  };
  useShortcuts(() => lyricsShortcuts(nudge, NUDGE_MS));

  const active = usePosition((seconds) => (synced ? activeLine(synced, seconds * 1000 - offset) : -1));

  // Follow the active line, unless you scrolled yourself: then wait 4 s (or the "back" button).
  const [following, setFollowing] = useState(true);
  const resume = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeElement = useRef<HTMLDivElement | null>(null);
  const userScrolled = () => {
    setFollowing(false);
    clearTimeout(resume.current);
    resume.current = setTimeout(() => setFollowing(true), RESUME_SCROLL_MS);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the line or following changes
  useEffect(() => {
    if (following) activeElement.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active, following]);

  if (isPending) return <LoadingLines />;
  if (!lyrics || lyrics.status === "missing" || (!lyrics.lines.length && lyrics.status !== "instrumental"))
    return (
      <div className="px-2">
        <EmptyState>no lyrics for this song</EmptyState>
        <Button
          variant="link"
          size="xs"
          className="px-0 font-mono text-muted-foreground"
          render={
            <a
              href={`https://lrclib.net/search/${encodeURIComponent(`${song.title} ${song.artist ?? ""}`.trim())}`}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          search lrclib <ExternalLinkIcon />
        </Button>
      </div>
    );
  if (lyrics.status === "instrumental")
    return (
      <div className="px-2">
        <EmptyState>instrumental · no words to show</EmptyState>
      </div>
    );

  const text = size === "full" ? "text-3xl leading-[1.3] gap-4" : "text-[17px] leading-[1.35] gap-1.5";
  return (
    <div className="relative flex flex-col">
      <div className="flex items-center gap-1.5 px-2 pt-2">
        {!synced && (
          <Hint label="these lyrics have no timing, so they can't follow the song">
            <Badge variant="outline" className="font-mono font-normal text-muted-foreground">
              plain
            </Badge>
          </Hint>
        )}
        {lyrics.translations?.length ? (
          <Hint label={showTranslation ? "hide translation" : `show ${lyrics.translations[0]?.lang} translation`}>
            <Button
              variant="ghost"
              size="xs"
              aria-pressed={showTranslation}
              className="font-mono text-muted-foreground"
              onClick={() => {
                setShowTranslation((value) => {
                  try {
                    localStorage.setItem(TRANSLATION_KEY, value ? "off" : "on");
                  } catch {
                    // Just for this session then.
                  }
                  return !value;
                });
              }}
            >
              <LanguagesIcon /> {lyrics.translations[0]?.lang}
            </Button>
          </Hint>
        ) : null}
      </div>
      <div className={cn("flex flex-col px-2 py-3 font-medium tracking-tight", text)} onWheel={userScrolled} onTouchMove={userScrolled}>
        {lyrics.lines.map((line, index) => (
          <Line
            // Lines repeat (choruses), so the position is the identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={index}
            line={line}
            song={song}
            size={size}
            offset={offset}
            translation={translation?.lines[index]}
            state={!synced ? "active" : index < active ? "past" : index === active ? "active" : "future"}
            lineRef={index === active ? (element) => (activeElement.current = element) : undefined}
          />
        ))}
      </div>
      {synced && (
        <footer className="sticky bottom-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t bg-background/95 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            timing <KeyCombo binding="[" /> <KeyCombo binding="]" />{" "}
            {offset ? `${offset > 0 ? "+" : ""}${(offset / 1000).toFixed(2)} s` : ""}
          </span>
          {lyrics.source === "lrclib" && lyrics.lrclibId && (
            <a
              className="underline-offset-3 hover:underline"
              href={`https://lrclib.net/tracks/${lyrics.lrclibId}`}
              target="_blank"
              rel="noreferrer"
            >
              off-sync? report on lrclib
            </a>
          )}
        </footer>
      )}
      {!following && synced && (
        <Button
          size="sm"
          variant="outline"
          className="sticky bottom-10 mx-auto bg-background"
          onClick={() => {
            clearTimeout(resume.current);
            setFollowing(true);
          }}
        >
          <LocateFixedIcon /> back to the current line
        </Button>
      )}
    </div>
  );
}
