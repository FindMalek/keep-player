import { Button } from "@keep/ui/components/button";
import { Input } from "@keep/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@keep/ui/components/select";
import { Toggle } from "@keep/ui/components/toggle";
import { ToggleGroup, ToggleGroupItem } from "@keep/ui/components/toggle-group";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { LayoutGridIcon, ListIcon, ShuffleIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AlbumRows } from "@/components/album-rows";
import { Hint } from "@/components/hint";
import { AlbumGrid, AlbumGridSkeleton, Content, EmptyState, PageHeader } from "@/components/library";
import { Delayed } from "@/components/skeletons";
import {
  ALBUM_SORTS,
  type AlbumFilter,
  type AlbumSort,
  isFiltering,
  matches,
  NO_FILTER,
  SERVER_TYPE,
  sortAlbums,
} from "@/lib/album-browse";
import { plural } from "@/lib/format";
import { usePageView } from "@/lib/page-view";
import { queries } from "@/lib/queries";
// Through browse, whose chunk the home page already loads, so the two pages share no chunk of their own (an extra
// shared chunk is one more request on the home page's critical path; Lighthouse notices).
import { LikedToggle, useAllPages } from "@/pages/browse";

const ANY = "any";
type Layout = "grid" | "list";
const DEFAULT_VIEW = { sort: "newest" as AlbumSort, layout: "grid" as Layout, ...NO_FILTER };

/** Albums (`g a`): six sorts, filters by genre, years, unplayed and liked, grid or list; your choices stay per browser. */
export function AlbumsPage() {
  const [view, change] = usePageView("albums", DEFAULT_VIEW);
  const [reshuffle, setReshuffle] = useState(0);
  const filter: AlbumFilter = view;
  const filtering = isFiltering(filter);
  const serverType = SERVER_TYPE[view.sort];
  // Sorts and filters the server can't do need every album: the pages keep loading until the library is here.
  const everything = filtering || !serverType;
  const pages = useInfiniteQuery(queries.albumPages(serverType ?? "newest"));
  const { items: all, loadMore } = useAllPages(pages);
  const starred = useQuery({ ...queries.starred(), enabled: view.liked });
  const genres = useQuery(queries.genres());
  const totals = useQuery(queries.totals());
  useEffect(() => {
    if (everything) loadMore();
  }, [everything, loadMore]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `reshuffle` is the only thing that should re-roll random
  const albums = useMemo(() => {
    const likedIds = new Set((starred.data?.album ?? []).map((album) => album.id));
    const kept = all.filter((album) => matches(album, { ...filter, liked: false }) && (!view.liked || likedIds.has(album.id)));
    return serverType ? kept : sortAlbums(kept, view.sort);
  }, [all, filter, view.liked, view.sort, serverType, starred.data, reshuffle]);
  const loadingAll = everything && pages.hasNextPage;
  const waiting = pages.isPending || (view.liked && starred.isPending);
  const genreNames = (genres.data ?? [])
    .filter((genre) => genre.albumCount > 0)
    .map((genre) => genre.value)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const year = (key: "fromYear" | "toYear") => (
    <Input
      type="number"
      inputMode="numeric"
      min={1900}
      max={2100}
      aria-label={key === "fromYear" ? "from year" : "to year"}
      placeholder={key === "fromYear" ? "from" : "to"}
      className="h-8 w-20 font-mono"
      value={view[key] || ""}
      onChange={(event) => change({ [key]: Math.max(0, Math.trunc(Number(event.target.value)) || 0) })}
    />
  );

  return (
    <>
      <PageHeader
        title="albums"
        meta={
          filtering && !loadingAll
            ? `${albums.length.toLocaleString()} of ${all.length.toLocaleString()}`
            : totals.data
              ? plural(totals.data.albums, "album")
              : undefined
        }
      >
        {view.sort === "random" && (
          <Button variant="outline" size="sm" onClick={() => setReshuffle((count) => count + 1)}>
            <ShuffleIcon /> reshuffle
          </Button>
        )}
        <Select value={view.sort} onValueChange={(value) => change({ sort: value as AlbumSort })}>
          <SelectTrigger size="sm" aria-label="sort albums" className="w-40 font-mono">
            <SelectValue>{ALBUM_SORTS.find(([value]) => value === view.sort)?.[1]}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            {ALBUM_SORTS.map(([value, label]) => (
              <SelectItem key={value} value={value} className="font-mono">
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="layout"
          value={[view.layout]}
          onValueChange={(value: string[]) => {
            const next = value[0] as Layout | undefined;
            if (next) change({ layout: next });
          }}
        >
          <Hint label="grid">
            <ToggleGroupItem value="grid" aria-label="grid">
              <LayoutGridIcon />
            </ToggleGroupItem>
          </Hint>
          <Hint label="list">
            <ToggleGroupItem value="list" aria-label="list">
              <ListIcon />
            </ToggleGroupItem>
          </Hint>
        </ToggleGroup>
      </PageHeader>
      <Content>
        <fieldset aria-label="filters" className="mb-3 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0">
          <Select value={view.genre || ANY} onValueChange={(value) => change({ genre: value === ANY ? "" : String(value) })}>
            <SelectTrigger size="sm" aria-label="genre" className="w-40 font-mono">
              <SelectValue>{view.genre ? view.genre.toLowerCase() : "any genre"}</SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} className="max-h-72">
              <SelectItem value={ANY} className="font-mono">
                any genre
              </SelectItem>
              {genreNames.map((name) => (
                <SelectItem key={name} value={name} className="font-mono">
                  {name.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {year("fromYear")}
          <span aria-hidden className="text-faint">
            –
          </span>
          {year("toYear")}
          <Toggle
            variant="outline"
            size="sm"
            pressed={view.unplayed}
            onPressedChange={(unplayed) => change({ unplayed })}
            className="font-mono font-normal"
          >
            unplayed
          </Toggle>
          <LikedToggle pressed={view.liked} onPressedChange={(liked) => change({ liked })} />
          {filtering && (
            <Button variant="ghost" size="sm" className="font-mono" onClick={() => change(NO_FILTER)}>
              clear filters
            </Button>
          )}
        </fieldset>
        {!waiting && !loadingAll && !albums.length && (
          <EmptyState>
            {view.liked && !filter.genre && !filter.fromYear && !filter.toYear && !filter.unplayed
              ? "no liked albums yet: the heart on an album page adds one"
              : "no albums match these filters"}
          </EmptyState>
        )}
        {waiting ? (
          <Delayed>
            <AlbumGridSkeleton count={24} />
          </Delayed>
        ) : view.layout === "list" ? (
          <AlbumRows albums={albums} onNearEnd={everything ? undefined : loadMore} />
        ) : (
          <AlbumGrid albums={albums} onNearEnd={everything ? undefined : loadMore} priority={16} />
        )}
        {loadingAll && <p className="mt-2 font-mono text-muted-foreground text-xs">loading the rest of your library…</p>}
      </Content>
    </>
  );
}
