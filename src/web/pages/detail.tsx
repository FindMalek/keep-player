import { ExternalLinkIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Cover } from "@/components/cover";
import { AlbumGrid, Content, EmptyState, PageHeader, Section, TrackList } from "@/components/library";
import { Link } from "@/components/link";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { length, plural, quality } from "@/lib/format";
import { player } from "@/lib/player";
import { api } from "@/lib/subsonic";
import type { Album, Artist, ArtistInfo, Playlist, Song } from "@/lib/types";
import { useQuery } from "@/lib/use-query";

function Hero({
  cover,
  kind,
  title,
  children,
  onPlay,
  onShuffle,
  onQueue,
}: {
  cover?: string;
  kind: ReactNode;
  title: string;
  children: ReactNode;
  onPlay: () => void;
  onShuffle: () => void;
  onQueue: () => void;
}) {
  return (
    <header className="flex items-end gap-5 border-b px-5 pt-[18px] pb-4">
      <Cover id={cover} size={160} className="w-[152px] shrink-0" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="self-start">{kind}</div>
        <h1 className="font-medium text-[26px] leading-[1.1] tracking-tight [overflow-wrap:anywhere]">{title}</h1>
        <div className="flex flex-col gap-0.5">{children}</div>
        <div className="mt-1 flex gap-1.5">
          <Button onClick={onPlay}>play</Button>
          <Button variant="outline" onClick={onShuffle}>
            shuffle
          </Button>
          <Button variant="outline" onClick={onQueue}>
            add to queue
          </Button>
        </div>
      </div>
    </header>
  );
}

const Kind = ({ children }: { children: ReactNode }) => (
  <Badge variant="outline" className="border-ring font-mono font-normal text-[10.5px] text-muted-foreground">
    {children}
  </Badge>
);

const Bio = ({ children }: { children: ReactNode }) => (
  <p className="line-clamp-3 max-w-[72ch] text-[12.5px] text-muted-foreground">{children}</p>
);

export function AlbumPage({ id }: { id: string }) {
  const { data, error } = useQuery(`album:${id}`, () => api<{ album: Album }>("getAlbum", { id }));
  if (error)
    return (
      <Content>
        <EmptyState>album not found</EmptyState>
      </Content>
    );
  const album = data?.album;
  if (!album) return null;
  const songs = album.song ?? [];
  const first = songs[0];
  const genres = album.genres?.map((genre) => genre.name) ?? (album.genre ? [album.genre] : []);

  return (
    <>
      <Hero
        cover={album.coverArt}
        kind={<Kind>album</Kind>}
        title={album.name}
        onPlay={() => player.play(songs, 0, { album: true, shuffle: false })}
        onShuffle={() => player.play(songs, 0, { shuffle: true })}
        onQueue={() => player.addToQueue(songs)}
      >
        {album.artistId && (
          <Link href={`/artist/${album.artistId}`} className="font-medium underline-offset-3 hover:underline">
            {album.artist}
          </Link>
        )}
        <span className="text-muted-foreground">
          {[album.year, plural(songs.length, "track"), length(album.duration), first ? quality(first.suffix, first.bitRate) : ""]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {(genres.length > 0 || album.recordLabels?.length) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {genres.map((genre) => (
              <Badge
                key={genre}
                variant="outline"
                className="font-mono font-normal"
                render={<Link href={`/genre/${encodeURIComponent(genre)}`} />}
              >
                {genre.toLowerCase()}
              </Badge>
            ))}
            {album.recordLabels?.map((label) => (
              <span key={label.name} className="text-muted-foreground text-xs">
                {label.name}
              </span>
            ))}
          </span>
        )}
      </Hero>
      <Content>
        <TrackList
          songs={songs}
          showAlbum={false}
          showArtist={songs.some((song) => song.artist !== album.artist)}
          numbered="track"
          asAlbum
        />
        {album.musicBrainzId && (
          <Button
            variant="link"
            size="xs"
            className="mt-4 px-0 font-mono text-muted-foreground"
            render={<a href={`https://musicbrainz.org/release/${album.musicBrainzId}`} target="_blank" rel="noreferrer" />}
          >
            musicbrainz <ExternalLinkIcon />
          </Button>
        )}
      </Content>
    </>
  );
}

export function ArtistPage({ id }: { id: string }) {
  const { data, error } = useQuery(`artist:${id}`, () => api<{ artist: Artist }>("getArtist", { id }));
  const info = useQuery(`artist-info:${id}`, () => api<{ artistInfo2: ArtistInfo }>("getArtistInfo2", { id }));
  const name = data?.artist.name;
  const top = useQuery(name ? `top:${name}` : null, () =>
    api<{ topSongs: { song?: Song[] } }>("getTopSongs", { artist: name, count: 10 }).then((response) => response.topSongs.song ?? []),
  );
  if (error)
    return (
      <Content>
        <EmptyState>artist not found</EmptyState>
      </Content>
    );
  const artist = data?.artist;
  if (!artist) return null;
  const albums = [...(artist.album ?? [])].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const bio = info.data?.artistInfo2.biography?.replace(/<a [^>]*>.*?<\/a>\.?/g, "").trim();
  const everything = async (): Promise<Song[]> =>
    (await Promise.all(albums.map((album) => api<{ album: Album }>("getAlbum", { id: album.id })))).flatMap(
      (response) => response.album.song ?? [],
    );

  return (
    <>
      <Hero
        cover={artist.coverArt}
        kind={<Kind>artist</Kind>}
        title={artist.name}
        onPlay={() => void everything().then((songs) => player.play(songs, 0, { shuffle: false }))}
        onShuffle={() => void everything().then((songs) => player.play(songs, 0, { shuffle: true }))}
        onQueue={() => void everything().then(player.addToQueue)}
      >
        <span className="text-muted-foreground">{plural(albums.length, "album")}</span>
        {bio && <Bio>{bio}</Bio>}
      </Hero>
      {(top.data?.length ?? 0) > 0 && (
        <Section title="popular">
          <TrackList songs={top.data ?? []} showArtist={false} />
        </Section>
      )}
      <Section title="albums">
        <AlbumGrid albums={albums} />
      </Section>
    </>
  );
}

export function GenrePage({ name }: { name: string }) {
  const { data } = useQuery(`genre:${name}`, () =>
    api<{ albumList2: { album?: Album[] } }>("getAlbumList2", { type: "byGenre", genre: name, size: 200 }).then(
      (response) => response.albumList2.album ?? [],
    ),
  );
  return (
    <>
      <PageHeader title={name.toLowerCase()} meta={data ? plural(data.length, "album") : "genre"} />
      <Content>
        <AlbumGrid albums={data ?? []} />
      </Content>
    </>
  );
}

export function PlaylistPage({ id }: { id: string }) {
  const { data, error } = useQuery(`playlist:${id}`, () => api<{ playlist: Playlist }>("getPlaylist", { id }));
  if (error)
    return (
      <Content>
        <EmptyState>playlist not found</EmptyState>
      </Content>
    );
  const playlist = data?.playlist;
  if (!playlist) return null;
  const songs = playlist.entry ?? [];
  const parts = playlist.name.split(" / ");

  return (
    <>
      <Hero
        cover={playlist.coverArt}
        kind={
          parts.length > 1 ? (
            <Breadcrumb>
              <BreadcrumbList className="font-mono text-[10.5px]">
                {parts.slice(0, -1).map((part) => (
                  <Fragment key={part}>
                    <BreadcrumbItem>{part}</BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </Fragment>
                ))}
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-muted-foreground">playlist</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          ) : (
            <Kind>playlist</Kind>
          )
        }
        title={parts.at(-1) ?? playlist.name}
        onPlay={() => player.play(songs, 0, { shuffle: false })}
        onShuffle={() => player.play(songs, 0, { shuffle: true })}
        onQueue={() => player.addToQueue(songs)}
      >
        <span className="text-muted-foreground">{[plural(songs.length, "track"), length(playlist.duration)].join(" · ")}</span>
        {playlist.comment && <Bio>{playlist.comment}</Bio>}
      </Hero>
      <Content>
        <TrackList songs={songs} />
      </Content>
    </>
  );
}
