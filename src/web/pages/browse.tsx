import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { HeartIcon, PlayIcon, ShuffleIcon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListContextMenu, type MenuTarget } from "@/components/item-menu";
import { AlbumGrid, AlbumGridSkeleton, Content, EmptyState, PageHeader, Section, TrackList } from "@/components/library";
import { Link } from "@/components/link";
import { ListFilterBar } from "@/components/list-filter-bar";
import { ArtistRowsSkeleton, Delayed, TrackListSkeleton } from "@/components/skeletons";
import { Alert, AlertAction, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { plural } from "@/lib/format";
import { closeListFilter, songMatches, useListFilter } from "@/lib/list-filter";
import { player } from "@/lib/player";
import { queries, queryClient } from "@/lib/queries";
import type { Album, Artist, Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useColumns, usePageVirtualizer } from "@/lib/virtual";

/** A home row: skeleton cards while loading (so nothing below moves when it arrives), hidden only once known empty. */
function AlbumRow({
  title,
  query,
  action,
  priority = 0,
}: {
  title: string;
  query: { data?: Album[]; isPending: boolean; isError: boolean; refetch: () => unknown };
  action?: ReactNode;
  priority?: number;
}) {
  // A failing row says so in place, with a retry; the other rows carry on.
  if (query.isError && !query.data)
    return (
      <Section title={title}>
        <Alert variant="destructive">
          <AlertTitle className="font-mono">couldn't load {title}</AlertTitle>
          <AlertAction>
            <Button size="xs" variant="outline" onClick={() => void query.refetch()}>
              retry
            </Button>
          </AlertAction>
        </Alert>
      </Section>
    );
  if (!query.isPending && !query.data?.length) return null;
  return (
    <Section title={title} action={action}>
      {query.data ? <AlbumGrid albums={query.data} priority={priority} /> : <AlbumGridSkeleton count={12} />}
    </Section>
  );
}

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
          <Empty>
            <EmptyHeader>
              <EmptyTitle className="font-mono">your library is empty</EmptyTitle>
              <EmptyDescription className="font-mono text-xs">
                add music to your navidrome folders; it shows up here after the next scan
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                size="sm"
                variant="outline"
                render={<a href="https://github.com/FindMalek/keep-player#run-it" target="_blank" rel="noreferrer" />}
              >
                how to add music
              </Button>
            </EmptyContent>
          </Empty>
        </Content>
      ) : (
        <>
          <AlbumRow title="recently added" query={newest} priority={8} />
          <AlbumRow title="recently played" query={recent} />
          <AlbumRow title="most played" query={frequent} />
          <AlbumRow
            title="rediscover"
            query={random}
            action={
              <Button variant="link" size="xs" className="h-auto p-0 font-mono text-muted-foreground" onClick={() => void random.refetch()}>
                shuffle
              </Button>
            }
          />
        </>
      )}
    </>
  );
}

/** Pages of an infinite list as one array, plus a callback that loads the next page once (no duplicate requests). */
export function useAllPages<T>(query: {
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

/** "Only what I liked" on the albums and artists pages. */
export function LikedToggle({ pressed, onPressedChange }: { pressed: boolean; onPressedChange: (pressed: boolean) => void }) {
  return (
    <Toggle variant="outline" size="sm" pressed={pressed} onPressedChange={onPressedChange} className="font-mono font-normal">
      <HeartIcon className={cn(pressed && "fill-current")} />
      liked
    </Toggle>
  );
}

const LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const LETTER_COLUMN = 48;
const ARTIST_MIN = 220;
const ARTIST_GAP = 24;

export function ArtistsPage() {
  const { data } = useQuery(queries.artists());
  const [likedOnly, setLikedOnly] = useState(false);
  const starred = useQuery({ ...queries.starred(), enabled: likedOnly });
  const groups = useMemo(() => {
    if (!likedOnly) return data ?? [];
    const ids = new Set((starred.data?.artist ?? []).map((artist) => artist.id));
    return (data ?? [])
      .map((group) => ({ ...group, artist: group.artist.filter((artist) => ids.has(artist.id)) }))
      .filter((group) => group.artist.length);
  }, [data, likedOnly, starred.data]);
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
        {/* The whole alphabet from the first frame (missing letters disabled), so its width never changes. */}
        <nav aria-label="jump to letter" className="flex flex-wrap justify-end">
          {[...new Set([...LETTERS, ...groups.map((group) => group.name)])].map((letter) => (
            <Button
              key={letter}
              variant="ghost"
              size="xs"
              className="w-5 px-0 font-mono text-muted-foreground"
              disabled={!letterRow.has(letter)}
              onClick={() => virtualizer.scrollToIndex(letterRow.get(letter) ?? 0, { align: "start" })}
            >
              {letter}
            </Button>
          ))}
        </nav>
        {/* Last, so the letters arriving grow leftwards instead of pushing it. */}
        <LikedToggle pressed={likedOnly} onPressedChange={setLikedOnly} />
      </PageHeader>
      <Content>
        {groups.length === 0 && data && <EmptyState>no artists</EmptyState>}
        {!data && <ArtistRowsSkeleton count={80} />}
        <ListContextMenu resolve={artistTarget}>
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
                  {row.letter ? <h2 className="font-mono text-[15px] text-faint">{row.letter}</h2> : <span aria-hidden />}
                  <ul className="grid gap-x-6" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                    {row.artists.map((artist) => (
                      <li key={artist.id} data-artist-id={artist.id} data-artist-name={artist.name}>
                        <Link
                          href={`/artist/${artist.id}`}
                          className="flex h-[26px] items-center justify-between gap-3 px-1.5 hover:bg-card"
                        >
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
        </ListContextMenu>
      </Content>
    </>
  );
}

/** Right-click an artist: the element carries its id and name. */
function artistTarget(element: Element): MenuTarget | null {
  const item = element.closest("[data-artist-id]");
  const id = item?.getAttribute("data-artist-id");
  return item && id ? { kind: "artist", artist: { id, name: item.getAttribute("data-artist-name") ?? "" } } : null;
}

const SONGS_SOURCE = { kind: "songs", name: "songs", href: "/songs" };

export function SongsPage() {
  const pages = useInfiniteQuery(queries.songPages());
  const { items: songs, loadMore } = useAllPages(pages);
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
        {pages.isPending ? <TrackListSkeleton count={24} /> : <TrackList songs={songs} onNearEnd={loadMore} source={SONGS_SOURCE} />}
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
        {!data && (
          <Delayed>
            <div aria-hidden className="flex flex-wrap gap-2">
              {Array.from({ length: 16 }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                <Skeleton key={index} className="h-7" style={{ width: `${72 + ((index * 41) % 64)}px` }} />
              ))}
            </div>
          </Delayed>
        )}
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

const LIKED_SORTS = [
  ["added", "recently liked"],
  ["title", "title"],
  ["artist", "artist"],
  ["album", "album"],
  ["plays", "most played"],
] as const;
type LikedSort = (typeof LIKED_SORTS)[number][0];
const LIKED_SOURCE = { kind: "liked", name: "liked songs", href: "/liked" };

function sortLiked(songs: Song[], sort: LikedSort): Song[] {
  const text = (value?: string) => value ?? "";
  const sorted = [...songs];
  if (sort === "added") sorted.sort((a, b) => text(b.starred).localeCompare(text(a.starred)));
  else if (sort === "plays") sorted.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
  else sorted.sort((a, b) => text(a[sort]).localeCompare(text(b[sort]), undefined, { sensitivity: "base" }));
  return sorted;
}

/** Liked Songs (`g l`): your stars from every client, sortable, filterable with ⌘F, optionally grouped by artist. */
export function LikedPage() {
  const { data } = useQuery(queries.starred());
  const [sort, setSort] = useState<LikedSort>("added");
  const [grouped, setGrouped] = useState(false);
  const songs = useMemo(() => sortLiked(data?.song ?? [], grouped ? "artist" : sort), [data, sort, grouped]);
  const filter = useListFilter("page");
  useEffect(() => () => closeListFilter("page"), []);
  const shown = useMemo(() => (filter ? songs.filter((song) => songMatches(song, filter)) : songs), [songs, filter]);
  const groups = useMemo(() => {
    const byArtist = new Map<string, Song[]>();
    for (const song of shown)
      byArtist.set(song.artist ?? "unknown artist", [...(byArtist.get(song.artist ?? "unknown artist") ?? []), song]);
    return [...byArtist];
  }, [shown]);

  return (
    <>
      <PageHeader title="liked songs" meta={data ? plural(data.song.length, "song") : undefined}>
        <Button size="sm" disabled={!songs.length} onClick={() => player.play(songs, 0, { source: LIKED_SOURCE })}>
          <PlayIcon /> play
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!songs.length}
          onClick={() => player.play(songs, -1, { shuffle: true, source: LIKED_SOURCE })}
        >
          <ShuffleIcon /> shuffle
        </Button>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="sort"
          value={[sort]}
          disabled={grouped}
          onValueChange={(value: string[]) => {
            const next = value[0] as LikedSort | undefined;
            if (next) setSort(next);
          }}
        >
          {LIKED_SORTS.map(([value, label]) => (
            <ToggleGroupItem key={value} value={value} className="font-mono font-normal">
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Toggle variant="outline" size="sm" pressed={grouped} onPressedChange={setGrouped} className="font-mono font-normal">
          group by artist
        </Toggle>
      </PageHeader>
      <Content>
        <div data-filter-scope="page">
          {filter !== null && <ListFilterBar scope="page" query={filter} shown={shown.length} total={songs.length} />}
          {!data ? (
            <TrackListSkeleton count={12} />
          ) : !songs.length ? (
            <EmptyState>no liked songs yet: the heart on any song (or F while it plays) adds it here and in Arpeggi</EmptyState>
          ) : filter && !shown.length ? (
            <EmptyState>nothing here matches “{filter}”</EmptyState>
          ) : grouped ? (
            groups.map(([artist, items]) => (
              <Section key={artist} title={artist}>
                <TrackList songs={items} showArtist={false} source={LIKED_SOURCE} />
              </Section>
            ))
          ) : (
            <TrackList songs={shown} source={LIKED_SOURCE} />
          )}
        </div>
      </Content>
    </>
  );
}
