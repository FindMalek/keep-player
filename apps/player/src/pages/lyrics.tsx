import type { LyricsCoverage } from "@lodesong/shared/lyrics";
import { Button } from "@lodesong/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@lodesong/ui/components/dialog";
import { Progress, ProgressLabel, ProgressValue } from "@lodesong/ui/components/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lodesong/ui/components/table";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { RefreshCwIcon, Undo2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Content, EmptyState, PageHeader, Section, TrackList } from "@/components/library";
import { Link } from "@/components/link";
import { TrackListSkeleton } from "@/components/skeletons";
import { apiQueries } from "@/lib/api-queries";
import { plural } from "@/lib/format";
import { queryClient } from "@/lib/queries";
import { HEADERS } from "@/lib/subsonic";
import type { Song } from "@/lib/types";

const PAGE = 200;

const coverage = {
  queryKey: ["lyricsCoverage"],
  queryFn: async (): Promise<LyricsCoverage> => {
    const response = await fetch("/api/lyrics/coverage", { headers: HEADERS });
    if (!response.ok) throw new Error(`lyrics coverage: ${response.status}`);
    return (await response.json()) as LyricsCoverage;
  },
  staleTime: 0,
  // Live while the backfill still has songs to reach.
  refetchInterval: (query: { state: { data?: LyricsCoverage } }) => ((query.state.data?.unchecked ?? 0) > 0 ? 5000 : false),
};

const missing = {
  queryKey: ["lyricsMissing"],
  queryFn: async ({ pageParam }: { pageParam: number }): Promise<Song[]> => {
    const response = await fetch(`/api/lyrics/missing?${new URLSearchParams({ offset: String(pageParam), limit: String(PAGE) })}`, {
      headers: HEADERS,
    });
    if (!response.ok) throw new Error(`missing lyrics: ${response.status}`);
    return ((await response.json()) as { songs: Song[] }).songs;
  },
  initialPageParam: 0,
  getNextPageParam: (last: Song[], pages: Song[][]) => (last.length < PAGE ? undefined : pages.length * PAGE),
  staleTime: 0,
};

const percent = (part: number, total: number) => (total ? Math.round((part / total) * 1000) / 10 : 0);
const count = (value: number) => value.toLocaleString();

/** One stacked bar, darkest for synced: grey tokens only. */
function CoverageBar({ data }: { data: LyricsCoverage }) {
  const parts = [
    ["synced", data.synced, "bg-foreground"],
    ["plain", data.plain, "bg-foreground/60"],
    ["instrumental", data.instrumental, "bg-foreground/30"],
    ["missing", data.missing, "bg-muted-foreground/20"],
  ] as const;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2 w-full overflow-hidden bg-muted" role="img" aria-label="lyrics coverage">
        {parts.map(([label, value, tone]) =>
          value ? <div key={label} className={tone} style={{ width: `${percent(value, data.total)}%` }} /> : null,
        )}
      </div>
      <dl className="grid grid-cols-[auto_auto_1fr] gap-x-4 gap-y-1 font-mono text-sm">
        {[...parts, ["not checked yet", data.unchecked, "bg-muted"] as const].map(([label, value, tone]) => (
          <div key={label} className="contents">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <span aria-hidden className={`size-2 ${tone}`} />
              {label}
            </dt>
            <dd className="text-right tabular-nums">{count(value)}</dd>
            <dd className="text-muted-foreground tabular-nums">{percent(value, data.total)}%</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Settings → library: how much of the library has lyrics, what's missing, and (admins) fetch again or undo .lrc files. */
export function LyricsPage() {
  const report = useQuery(coverage);
  const admin = useQuery(apiQueries.session()).data?.admin;
  const songs = useInfiniteQuery(missing);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);

  const end = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = songs;
  useEffect(() => {
    const element = end.current;
    if (!element || !hasNextPage) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  async function refetch(): Promise<void> {
    setBusy(true);
    const response = await fetch("/api/lyrics/refetch", { method: "POST", headers: HEADERS }).catch(() => null);
    setBusy(false);
    if (!response?.ok) return setNote("couldn't start the lookup");
    const result = (await response.json()) as { forgotten: number; backfill: boolean };
    setNote(
      result.backfill
        ? `asking lrclib again about ${plural(result.forgotten, "song")}`
        : `${plural(result.forgotten, "song")} will be asked again when played (the backfill is off)`,
    );
    await queryClient.invalidateQueries({ queryKey: ["lyricsCoverage"] });
    await queryClient.invalidateQueries({ queryKey: ["lyricsMissing"] });
  }

  async function undo(): Promise<void> {
    setUndoOpen(false);
    const response = await fetch("/api/lyrics/written", { method: "DELETE", headers: HEADERS }).catch(() => null);
    if (!response?.ok) return setNote("couldn't remove the .lrc files");
    const result = (await response.json()) as { removed: number; kept: number };
    setNote(`removed ${plural(result.removed, ".lrc file")}${result.kept ? `, kept ${result.kept} changed since` : ""}`);
    await queryClient.invalidateQueries({ queryKey: ["lyricsCoverage"] });
  }

  const data = report.data;
  const list = songs.data?.pages.flat() ?? [];
  return (
    <>
      <PageHeader
        title="lyrics"
        meta={data ? `${percent(data.synced + data.plain, data.total)}% of ${plural(data.total, "song")} have lyrics` : undefined}
      >
        {admin && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void refetch()}>
              <RefreshCwIcon className={busy || (data?.unchecked ?? 0) > 0 ? "animate-spin" : undefined} />
              fetch missing now
            </Button>
            {(data?.written ?? 0) > 0 && (
              <Button variant="outline" size="sm" onClick={() => setUndoOpen(true)}>
                <Undo2Icon />
                remove {plural(data?.written ?? 0, ".lrc file")}
              </Button>
            )}
          </div>
        )}
      </PageHeader>
      <Content>
        {report.isError ? (
          <EmptyState>couldn't read lyrics coverage</EmptyState>
        ) : !data ? (
          <TrackListSkeleton count={4} />
        ) : data.total === 0 ? (
          <EmptyState>the library index is empty · it fills after the first sync</EmptyState>
        ) : (
          <div className="flex max-w-xl flex-col gap-4">
            <Progress value={percent(data.synced, data.total)}>
              <ProgressLabel className="font-mono">synced</ProgressLabel>
              <ProgressValue className="font-mono" />
            </Progress>
            <CoverageBar data={data} />
            {note && <p className="font-mono text-muted-foreground text-sm">{note}</p>}
            {data.written === undefined && admin && (
              <p className="text-muted-foreground text-sm">
                lyrics found on lrclib live only in lodesong. set <code className="font-mono">LYRICS_WRITE_LRC=on</code> to also save them
                as .lrc files next to your music, so every other client gets them.
              </p>
            )}
          </div>
        )}
      </Content>
      {data && data.albums.length > 0 && (
        <Section title="albums missing the most">
          <Table className="font-mono">
            <TableHeader>
              <TableRow>
                <TableHead>album</TableHead>
                <TableHead>artist</TableHead>
                <TableHead className="text-right">missing</TableHead>
                <TableHead className="text-right">synced</TableHead>
                <TableHead className="text-right">songs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.albums.map((album) => (
                <TableRow key={album.id}>
                  <TableCell className="max-w-64 truncate">
                    <Link href={`/album/${encodeURIComponent(album.id)}`} className="hover:underline">
                      {album.name || "unknown album"}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">{album.artist}</TableCell>
                  <TableCell className="text-right tabular-nums">{album.missing}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{album.synced}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{album.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}
      <Section title={data ? `no lyrics found · ${plural(data.missing, "song")}` : "no lyrics found"}>
        {songs.isPending ? (
          <TrackListSkeleton count={8} />
        ) : list.length === 0 ? (
          <EmptyState>nothing missing so far</EmptyState>
        ) : (
          <TrackList filterable songs={list} source={{ kind: "lyrics", name: "songs without lyrics", href: "/lyrics" }} />
        )}
      </Section>
      <div ref={end} aria-hidden className="h-px" />
      <Dialog open={undoOpen} onOpenChange={setUndoOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono">remove written .lrc files?</DialogTitle>
            <DialogDescription>
              deletes every .lrc lodesong wrote next to your music. files edited since are kept. lyrics stay in lodesong.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUndoOpen(false)}>
              cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void undo()}>
              remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
