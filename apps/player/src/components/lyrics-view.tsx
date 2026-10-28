import type { LyricLine } from "@lodesong/shared/lyrics";
import { Badge } from "@lodesong/ui/components/badge";
import { Button } from "@lodesong/ui/components/button";
import { Skeleton } from "@lodesong/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { CopyIcon, ExternalLinkIcon, LanguagesIcon, LocateFixedIcon, Share2Icon } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { apiQueries } from "@/lib/api-queries";
import { clock } from "@/lib/format";
import { notify } from "@/lib/notify";
import { player, usePosition } from "@/lib/player";
import { queries, queryClient } from "@/lib/queries";
import { useShortcuts } from "@/lib/shortcuts";
import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { lyricsShortcuts } from "../app-shortcuts";
import { Hint } from "./hint";
import { KeyCombo } from "./key-combo";
import { EmptyState } from "./library";
import { Delayed } from "./skeletons";

type Size = "panel" | "full";
type LineState = "past" | "active" | "future";

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
        <span key={index} className={index < sung ? "text-foreground" : "text-muted-foreground"}>
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
          // One weight for every line: a bolder active line would rewrap and make its neighbours jump. It stands out
          // by opacity and size (a transform, no reflow); 60% still clears 4.5:1 contrast in both themes.
          "flex-1 origin-left text-left text-foreground transition-[opacity,transform] duration-300 ease-out hover:opacity-100 motion-reduce:transition-none",
          state === "future" && "scale-[0.97] opacity-80",
          state === "past" && "scale-[0.97] opacity-60",
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

  const save = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nudge = (delta: number) => {
    if (!synced) return false;
    setOffset((current) => {
      const next = current + delta;
      clearTimeout(save.current);
      save.current = setTimeout(() => {
        void fetch(`/api/lyrics/${encodeURIComponent(song.id)}/offset`, {
          method: "PUT",
          headers: { "x-lodesong": "1", "content-type": "application/json" },
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
  const placed = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the line or following changes
  useEffect(() => {
    const element = activeElement.current;
    if (!following || !element) return;
    const smooth = placed.current && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "instant" });
    placed.current = true;
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

  const panelFades = Boolean(synced) && size === "panel";
  const text = size === "full" ? "text-4xl leading-[1.2] gap-7" : "text-lg leading-snug gap-4";
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
                  } catch {}
                  return !value;
                });
              }}
            >
              <LanguagesIcon /> {lyrics.translations[0]?.lang}
            </Button>
          </Hint>
        ) : null}
      </div>
      {/* In the panel, lines fade out under the top edge and above the footer instead of being cut off (full screen
          masks its scroller instead: its aura shows through, so a solid fade would show as a band). */}
      {panelFades && <div aria-hidden className="pointer-events-none sticky top-0 z-10 -mb-10 h-10 bg-linear-to-b from-background" />}
      <div
        // Room under the last line so it can still reach the middle. Plain lyrics are all "active", so lighter.
        className={cn("flex flex-col px-2 py-3 tracking-tight", synced ? "pb-[30vh] font-semibold" : "font-medium", text)}
        onWheel={userScrolled}
        onTouchMove={userScrolled}
      >
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
      {panelFades && <div aria-hidden className="pointer-events-none sticky bottom-8 z-10 -mt-12 h-12 bg-linear-to-t from-background" />}
      {synced && (
        <footer
          className={cn(
            "z-10",
            panelFades && "sticky bottom-0 bg-background",
            "flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-2 py-1.5 font-mono text-meta text-muted-foreground",
          )}
        >
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
          // Above the fades: full screen fades its bottom 15%.
          className={cn("sticky z-20 mx-auto bg-background", panelFades ? "bottom-10" : "bottom-[18%]")}
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
