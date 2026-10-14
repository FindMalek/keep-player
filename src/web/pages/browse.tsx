import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { AlbumGrid, Content, EmptyState, PageHeader, Section, TrackList } from "@/components/library";
import { Link } from "@/components/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { plural } from "@/lib/format";
import { player } from "@/lib/player";
import { queries, queryClient } from "@/lib/queries";
import type { Artist } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useColumns, usePageVirtualizer } from "@/lib/virtual";

export function HomePage() {
  const newest = useQuery(queries.albumList("newest", 12));
  const recent = useQuery(queries.albumList("recent", 12));
  const frequent = useQuery(queries.albumList("frequent", 12));
  const random = useQuery(queries.albumList("random", 12));
  const nothing = [newest, recent, frequent].every((query) => query.data && query.data.length === 0);

  return (
    <>
      <PageHeader title="home" />
      {nothing ? (
        <Content>
          <EmptyState>your library is empty · add albums to your navidrome library and they show up here after the next scan</EmptyState>
        </Content>
      ) : (
        <>
          <Section title="recently added">
            <AlbumGrid albums={newest.data ?? []} />
          </Section>
          {(recent.data?.length ?? 0) > 0 && (
            <Section title="recently played" deferred>
              <AlbumGrid albums={recent.data ?? []} />
            </Section>
          )}
          {(frequent.data?.length ?? 0) > 0 && (
            <Section title="most played" deferred>
              <AlbumGrid albums={frequent.data ?? []} />
            </Section>
          )}
          <Section
            title="rediscover"
            deferred
            action={
              <Button variant="link" size="xs" className="h-auto p-0 font-mono text-muted-foreground" onClick={() => void random.refetch()}>
                shuffle
              </Button>
            }
          >
            <AlbumGrid albums={random.data ?? []} />
          </Section>
        </>
      )}
    </>
  );
}

const SORTS = [
  ["newest", "recently added"],
  ["alphabeticalByName", "a–z"],
  ["alphabeticalByArtist", "artist"],
  ["frequent", "most played"],
] as const;
type Sort = (typeof SORTS)[number][0];

/** Pages of an infinite list as one array, plus a callback that loads the next page once (no duplicate requests). */
function useAllPages<T>(query: {
  data?: { pages: T[][] };
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
}) {
  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return { items, loadMore };
}

export function AlbumsPage() {
  const [sort, setSort] = useState<Sort>("newest");
  const { items: albums, loadMore } = useAllPages(useInfiniteQuery(queries.albumPages(sort)));
  const totals = useQuery(queries.totals());

  return (
    <>
      <PageHeader title="albums" meta={totals.data ? plural(totals.data.albums, "album") : undefined}>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="sort"
          value={[sort]}
          onValueChange={(value: string[]) => {
            const next = value[0] as Sort | undefined;
            if (next) setSort(next);
          }}
        >
          {SORTS.map(([value, label]) => (
            <ToggleGroupItem key={value} value={value} className="font-mono font-normal">
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PageHeader>
      <Content>
        <AlbumGrid albums={albums} onNearEnd={loadMore} />
      </Content>
    </>
  );
}

const LETTER_COLUMN = 48;
const ARTIST_MIN = 220;
const ARTIST_GAP = 24;

export function ArtistsPage() {
  const { data } = useQuery(queries.artists());
  const groups = data ?? [];
  const total = groups.reduce((sum, group) => sum + group.artist.length, 0);
  const listRef = useRef<HTMLDivElement>(null);
  const { width } = useColumns(listRef, ARTIST_MIN, ARTIST_GAP);
  const columns = Math.max(1, Math.floor((width - LETTER_COLUMN + ARTIST_GAP) / (ARTIST_MIN + ARTIST_GAP)));
  // One virtual row per line of artists; the first line of each letter carries the letter.
  const { rows, letterRow } = useMemo(() => {
    const rows: { letter: string; artists: Artist[]; last: boolean }[] = [];
    const letterRow = new Map<string, number>();
    for (const group of groups) {
      letterRow.set(group.name, rows.length);
      for (let start = 0; start < group.artist.length; start += columns)
        rows.push({
          letter: start === 0 ? group.name : "",
          artists: group.artist.slice(start, start + columns),
          last: start + columns >= group.artist.length,
        });
    }
    return { rows, letterRow };
  }, [groups, columns]);
  const virtualizer = usePageVirtualizer(listRef, { count: rows.length, estimateSize: (index) => (rows[index]?.last ? 44 : 28) });
  const margin = virtualizer.options.scrollMargin;

  return (
    <>
      <PageHeader title="artists" meta={data ? plural(total, "artist") : undefined}>
        <nav aria-label="jump to letter" className="flex flex-wrap justify-end">
          {groups.map((group) => (
            <Button
              key={group.name}
              variant="ghost"
              size="xs"
              className="w-5 px-0 font-mono text-muted-foreground"
              onClick={() => virtualizer.scrollToIndex(letterRow.get(group.name) ?? 0, { align: "start" })}
            >
              {group.name}
            </Button>
          ))}
        </nav>
      </PageHeader>
      <Content>
        {groups.length === 0 && data && <EmptyState>no artists</EmptyState>}
        <div ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            return (
              <div
                key={item.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className={cn("absolute inset-x-0 grid grid-cols-[48px_minmax(0,1fr)]", row.last && "border-muted border-b pb-2")}
                style={{ transform: `translateY(${item.start - margin}px)`, paddingTop: row.letter ? 8 : 0 }}
              >
                <h2 className="font-mono text-[15px] text-faint">{row.letter}</h2>
                <ul className="grid gap-x-6" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                  {row.artists.map((artist) => (
                    <li key={artist.id}>
                      <Link href={`/artist/${artist.id}`} className="flex h-[26px] items-center justify-between gap-3 px-1.5 hover:bg-card">
                        <span className="truncate">{artist.name}</span>
                        <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
                          {plural(artist.albumCount ?? 0, "album")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Content>
    </>
  );
}

const SONGS_SOURCE = { kind: "songs", name: "songs", href: "/songs" };

export function SongsPage() {
  const { items: songs, loadMore } = useAllPages(useInfiniteQuery(queries.songPages()));
  const totals = useQuery(queries.totals());

  return (
    <>
      <PageHeader title="songs" meta={totals.data ? plural(totals.data.songs, "song") : undefined}>
        <Button
          variant="outline"
          // The whole library, not just the loaded pages: the server picks 500 at random.
          onClick={() =>
            void queryClient
              .fetchQuery(queries.randomSongs(500))
              .then((random) => player.play(random, 0, { shuffle: false, source: { kind: "songs", name: "all songs", href: "/songs" } }))
          }
          disabled={!songs.length}
        >
          shuffle all
        </Button>
      </PageHeader>
      <Content>
        <TrackList songs={songs} onNearEnd={loadMore} source={SONGS_SOURCE} />
      </Content>
    </>
  );
}

export function GenresPage() {
  const { data } = useQuery(queries.genres());
  const genres = (data ?? []).filter((genre) => genre.albumCount > 0).sort((a, b) => b.songCount - a.songCount);

  return (
    <>
      <PageHeader title="genres" meta={data ? plural(genres.length, "genre") : undefined} />
      <Content>
        {genres.length === 0 && data && <EmptyState>no genres yet · they come from your files' tags</EmptyState>}
        <ul className="flex flex-wrap gap-2">
          {genres.map((genre) => (
            <li key={genre.value}>
              <Badge
                variant="outline"
                className="h-7 gap-2.5 px-2.5 font-mono font-normal"
                render={<Link href={`/genre/${encodeURIComponent(genre.value)}`} />}
              >
                {genre.value.toLowerCase()}
                <span className="text-muted-foreground tabular-nums">{genre.albumCount}</span>
              </Badge>
            </li>
          ))}
        </ul>
      </Content>
    </>
  );
}
