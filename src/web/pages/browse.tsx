import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlbumGrid, Content, EmptyState, PageHeader, Section, TrackList } from "@/components/library";
import { Link } from "@/components/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { plural } from "@/lib/format";
import { player } from "@/lib/player";
import { queries } from "@/lib/queries";

function LoadMore({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" className="mx-auto mt-4 flex" onClick={onClick}>
      load more
    </Button>
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
          <EmptyState>your library is empty · add albums to your navidrome library and they show up here after the next scan</EmptyState>
        </Content>
      ) : (
        <>
          <Section title="recently added">
            <AlbumGrid albums={newest.data ?? []} />
          </Section>
          {(recent.data?.length ?? 0) > 0 && (
            <Section title="recently played">
              <AlbumGrid albums={recent.data ?? []} />
            </Section>
          )}
          {(frequent.data?.length ?? 0) > 0 && (
            <Section title="most played">
              <AlbumGrid albums={frequent.data ?? []} />
            </Section>
          )}
          <Section
            title="rediscover"
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
const PAGE = 60;

export function AlbumsPage() {
  const [sort, setSort] = useState<Sort>("newest");
  const [pages, setPages] = useState(1);
  // Keep the list on screen while the next page loads, but not across a sort change.
  const { data } = useQuery({
    ...queries.albumList(sort, PAGE * pages),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === sort ? previous : undefined),
  });

  return (
    <>
      <PageHeader title="albums" meta={data ? plural(data.length, "album") : undefined}>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="sort"
          value={[sort]}
          onValueChange={(value: string[]) => {
            const next = value[0] as Sort | undefined;
            if (!next) return;
            setSort(next);
            setPages(1);
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
        <AlbumGrid albums={data ?? []} />
        {data?.length === PAGE * pages && <LoadMore onClick={() => setPages(pages + 1)} />}
      </Content>
    </>
  );
}

export function ArtistsPage() {
  const { data } = useQuery(queries.artists());
  const index = data ?? [];
  const total = index.reduce((sum, group) => sum + group.artist.length, 0);

  return (
    <>
      <PageHeader title="artists" meta={data ? plural(total, "artist") : undefined} />
      <Content>
        {index.length === 0 && data && <EmptyState>no artists</EmptyState>}
        {index.map((group) => (
          <section key={group.name} className="grid grid-cols-[48px_minmax(0,1fr)] border-muted border-b py-2">
            <h2 className="font-mono text-[15px] text-faint">{group.name}</h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-0.5">
              {group.artist.map((artist) => (
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
          </section>
        ))}
      </Content>
    </>
  );
}

const SONG_PAGE = 200;

export function SongsPage() {
  const [pages, setPages] = useState(1);
  const { data } = useQuery({ ...queries.songs(SONG_PAGE * pages), placeholderData: (previous) => previous });
  const songs = data ?? [];

  return (
    <>
      <PageHeader title="songs" meta={data ? plural(songs.length, "song") : undefined}>
        <Button variant="outline" onClick={() => player.play(songs, 0, { shuffle: true })} disabled={!songs.length}>
          shuffle all
        </Button>
      </PageHeader>
      <Content>
        <TrackList songs={songs} />
        {songs.length === SONG_PAGE * pages && <LoadMore onClick={() => setPages(pages + 1)} />}
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
