import { useState } from "react";
import { AlbumGrid, Empty, PageHeader, Section, TrackList } from "../components/library";
import { plural } from "../lib/format";
import { player } from "../lib/player";
import { navigate } from "../lib/router";
import { api } from "../lib/subsonic";
import type { Album, Artist, Genre, Song } from "../lib/types";
import { useQuery } from "../lib/use-query";

type AlbumList = { albumList2: { album?: Album[] } };

const albums = (type: string, size: number, extra: Record<string, string | number> = {}) =>
  api<AlbumList>("getAlbumList2", { type, size, ...extra }).then((response) => response.albumList2.album ?? []);

export function HomePage() {
  const newest = useQuery("home:newest", () => albums("newest", 12));
  const recent = useQuery("home:recent", () => albums("recent", 12));
  const frequent = useQuery("home:frequent", () => albums("frequent", 12));
  const random = useQuery("home:random", () => albums("random", 12));
  const nothing = [newest, recent, frequent].every((query) => query.data && query.data.length === 0);

  return (
    <>
      <PageHeader title="home" />
      {nothing ? (
        <Empty>your library is empty · drop albums in the music inbox and they appear here within 5 minutes</Empty>
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
              <button type="button" className="text-button" onClick={random.reload}>
                shuffle
              </button>
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
const PAGE = 60;

export function AlbumsPage() {
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>("newest");
  const [pages, setPages] = useState(1);
  const { data } = useQuery(`albums:${sort}:${pages}`, () => albums(sort, PAGE * pages));

  return (
    <>
      <PageHeader title="albums" meta={data ? plural(data.length, "album") : undefined}>
        <div className="tabs" role="group" aria-label="sort">
          {SORTS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="tab"
              aria-pressed={sort === value}
              onClick={() => {
                setSort(value);
                setPages(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </PageHeader>
      <div className="content">
        <AlbumGrid albums={data ?? []} />
        {data?.length === PAGE * pages && (
          <button type="button" className="button more" onClick={() => setPages(pages + 1)}>
            load more
          </button>
        )}
      </div>
    </>
  );
}

export function ArtistsPage() {
  const { data } = useQuery("artists", () => api<{ artists: { index?: { name: string; artist: Artist[] }[] } }>("getArtists"));
  const index = data?.artists.index ?? [];
  const total = index.reduce((sum, group) => sum + group.artist.length, 0);

  return (
    <>
      <PageHeader title="artists" meta={data ? plural(total, "artist") : undefined} />
      <div className="content">
        {index.length === 0 && data && <Empty>no artists</Empty>}
        {index.map((group) => (
          <section key={group.name} className="letter-group">
            <h2 className="letter">{group.name}</h2>
            <ul className="artist-list">
              {group.artist.map((artist) => (
                <li key={artist.id}>
                  <a href={`/artist/${artist.id}`} onClick={navigate}>
                    <span className="ellipsis">{artist.name}</span>
                    <span className="num muted small">{plural(artist.albumCount ?? 0, "album")}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

const SONG_PAGE = 200;

export function SongsPage() {
  const [pages, setPages] = useState(1);
  const { data } = useQuery(`songs:${pages}`, () =>
    api<{ searchResult3: { song?: Song[] } }>("search3", { query: "", songCount: SONG_PAGE * pages, artistCount: 0, albumCount: 0 }).then(
      (response) => response.searchResult3.song ?? [],
    ),
  );
  const songs = data ?? [];

  return (
    <>
      <PageHeader title="songs" meta={data ? plural(songs.length, "song") : undefined}>
        <button type="button" className="button" onClick={() => player.play(songs, 0, { shuffle: true })} disabled={!songs.length}>
          shuffle all
        </button>
      </PageHeader>
      <div className="content">
        <TrackList songs={songs} />
        {songs.length === SONG_PAGE * pages && (
          <button type="button" className="button more" onClick={() => setPages(pages + 1)}>
            load more
          </button>
        )}
      </div>
    </>
  );
}

export function GenresPage() {
  const { data } = useQuery("genres", () => api<{ genres: { genre?: Genre[] } }>("getGenres"));
  const genres = (data?.genres.genre ?? []).filter((genre) => genre.albumCount > 0).sort((a, b) => b.songCount - a.songCount);

  return (
    <>
      <PageHeader title="genres" meta={data ? plural(genres.length, "genre") : undefined} />
      <div className="content">
        {genres.length === 0 && data && <Empty>no genres yet · beets adds them on import</Empty>}
        <ul className="tag-cloud">
          {genres.map((genre) => (
            <li key={genre.value}>
              <a href={`/genre/${encodeURIComponent(genre.value)}`} onClick={navigate} className="tag">
                {genre.value.toLowerCase()}
                <span className="muted num">{genre.albumCount}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
