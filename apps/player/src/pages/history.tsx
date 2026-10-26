import type { Play } from "@keep/shared/history";
import { Button } from "@keep/ui/components/button";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { PlayIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { AlbumGrid, Content, EmptyState, PageHeader, Section, TrackList } from "@/components/library";
import { TrackListSkeleton } from "@/components/skeletons";
import { length, plural } from "@/lib/format";
import { player } from "@/lib/player";
import { queries } from "@/lib/queries";
import { HEADERS } from "@/lib/subsonic";
import type { Song } from "@/lib/types";

const PAGE = 200;

const history = {
  queryKey: ["history"],
  queryFn: async ({ pageParam }: { pageParam: number }): Promise<Play[]> => {
    const response = await fetch(`/api/history?${new URLSearchParams({ before: String(pageParam), limit: String(PAGE) })}`, {
      headers: HEADERS,
    });
    if (!response.ok) throw new Error(`history: ${response.status}`);
    return ((await response.json()) as { plays: Play[] }).plays;
  },
  initialPageParam: Number.MAX_SAFE_INTEGER,
  getNextPageParam: (last: Play[]) => (last.length < PAGE ? undefined : last.at(-1)?.started),
  staleTime: 0,
};

function dayLabel(time: number): string {
  const day = new Date(time);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (day.toDateString() === today.toDateString()) return "today";
  if (day.toDateString() === yesterday.toDateString()) return "yesterday";
  return day
    .toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: day.getFullYear() === today.getFullYear() ? undefined : "numeric",
    })
    .toLowerCase();
}

/** `g p`: everything you played here, day by day (newest first), with "play again" for a whole day. */
export function HistoryPage() {
  const plays = useInfiniteQuery(history);
  const recent = useQuery(queries.albumList("recent", 12));
  const days = useMemo(() => {
    const byDay = new Map<string, Play[]>();
    for (const play of plays.data?.pages.flat() ?? []) {
      const label = dayLabel(play.started);
      byDay.set(label, [...(byDay.get(label) ?? []), play]);
    }
    return [...byDay];
  }, [plays.data]);

  // The next page when the end comes into view.
  const end = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = plays;
  useEffect(() => {
    const element = end.current;
    if (!element || !hasNextPage) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <>
      <PageHeader title="history" />
      {(recent.data?.length ?? 0) > 0 && (
        <Section title="albums you played lately">
          <AlbumGrid albums={recent.data ?? []} />
        </Section>
      )}
      <Content>
        {plays.isPending ? (
          <TrackListSkeleton count={12} />
        ) : days.length === 0 ? (
          <EmptyState>nothing played here yet · what you play shows up here, day by day</EmptyState>
        ) : null}
      </Content>
      {days.map(([label, dayPlays]) => {
        // Oldest first, the way the day went.
        const songs = [...dayPlays].reverse().map((play) => play.song as unknown as Song);
        const skipped = dayPlays.filter((play) => play.skipped).length;
        const listened = dayPlays.reduce((total, play) => total + play.listened, 0);
        return (
          <Section
            key={label}
            title={`${label} · ${plural(dayPlays.length, "song")} · ${length(listened)}${skipped ? ` · ${skipped} skipped` : ""}`}
            action={
              <Button
                variant="link"
                size="xs"
                className="h-auto gap-1 p-0 font-mono text-muted-foreground"
                onClick={() => player.play(songs, 0, { source: { kind: "history", name: label, href: "/history" } })}
              >
                <PlayIcon /> play again
              </Button>
            }
          >
            <TrackList songs={songs} source={{ kind: "history", name: label, href: "/history" }} />
          </Section>
        );
      })}
      <div ref={end} aria-hidden className="h-px" />
    </>
  );
}
