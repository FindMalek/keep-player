import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { ArtistCard } from "@/components/artist-card";
import { Cover } from "@/components/cover";
import { KeepOffline } from "@/components/keep-offline";
import { AlbumGrid, Content, EmptyState, PageHeader, Section, TrackList } from "@/components/library";
import { LikeButton } from "@/components/like-button";
import { Link } from "@/components/link";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { length, plural, quality } from "@/lib/format";
import type { LikeKind } from "@/lib/likes";
import { player } from "@/lib/player";
import { queries, queryClient } from "@/lib/queries";
import type { Song } from "@/lib/types";

function Hero({
  cover,
  kind,
  title,
  children,
  onPlay,
  onShuffle,
  onQueue,
  extra,
  like,
}: {
  cover?: string;
  kind: ReactNode;
  title: string;
  children: ReactNode;
  onPlay: () => void;
  onShuffle: () => void;
  onQueue: () => void;
  /** More actions after "add to queue" (keep offline). */
  extra?: ReactNode;
  /** A heart for albums and artists. */
  like?: { kind: LikeKind; id: string };
}) {
  return (
    <header className="flex items-end gap-5 border-b px-5 pt-[18px] pb-4">
      <Cover id={cover} size={160} className="w-[152px] shrink-0" priority />
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
          {extra}
          {like && <LikeButton kind={like.kind} id={like.id} label={title} className="size-8" />}
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
  const { data: album, error } = useQuery(queries.album(id));
  if (error)
    return (
      <Content>
        <EmptyState>album not found</EmptyState>
      </Content>
    );
  if (!album) return null;
  const songs = album.song ?? [];
  const source = { kind: "album", name: album.name, href: `/album/${album.id}` };
  const first = songs[0];
  const genres = album.genres?.map((genre) => genre.name) ?? (album.genre ? [album.genre] : []);

  return (
    <>
      <Hero
        cover={album.coverArt}
        kind={<Kind>album</Kind>}
        title={album.name}
        onPlay={() => player.play(songs, 0, { album: true, shuffle: false, source })}
        onShuffle={() => player.play(songs, -1, { shuffle: true, source })}
        onQueue={() => player.addToQueue(songs)}
        extra={<KeepOffline group={`album:${album.id}`} songs={songs} />}
        like={{ kind: "album", id: album.id }}
      >
        {album.artistId && (
          <ArtistCard id={album.artistId} name={album.artist ?? ""}>
            <Link href={`/artist/${album.artistId}`} className="self-start font-medium underline-offset-3 hover:underline">
              {album.artist}
            </Link>
          </ArtistCard>
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
          filterable
          source={source}
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
  const { data: artist, error } = useQuery(queries.artist(id));
  const info = useQuery(queries.artistInfo(id));
  const name = artist?.name;
  const top = useQuery({ ...queries.topSongs(name ?? ""), enabled: Boolean(name) });
  if (error)
    return (
      <Content>
        <EmptyState>artist not found</EmptyState>
      </Content>
    );
  if (!artist) return null;
  const albums = [...(artist.album ?? [])].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const source = { kind: "artist", name: artist.name, href: `/artist/${artist.id}` };
  const bio = info.data?.biography?.replace(/<a [^>]*>.*?<\/a>\.?/g, "").trim();
  const everything = async (): Promise<Song[]> =>
    (await Promise.all(albums.map((album) => queryClient.fetchQuery(queries.album(album.id))))).flatMap((album) => album.song ?? []);

  return (
    <>
      <Hero
        cover={artist.coverArt}
        kind={<Kind>artist</Kind>}
        title={artist.name}
        onPlay={() => void everything().then((songs) => player.play(songs, 0, { shuffle: false, source }))}
        onShuffle={() => void everything().then((songs) => player.play(songs, -1, { shuffle: true, source }))}
        onQueue={() => void everything().then(player.addToQueue)}
        like={{ kind: "artist", id: artist.id }}
      >
        <span className="text-muted-foreground">{plural(albums.length, "album")}</span>
        {bio && <Bio>{bio}</Bio>}
      </Hero>
      {(top.data?.length ?? 0) > 0 && (
        <Section title="popular">
          <TrackList songs={top.data ?? []} showArtist={false} source={source} />
        </Section>
      )}
      <Section title="albums">
        <AlbumGrid albums={albums} />
      </Section>
    </>
  );
}

export function GenrePage({ name }: { name: string }) {
  const { data } = useQuery(queries.albumList("byGenre", 200, { genre: name }));
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
  const { data: playlist, error } = useQuery(queries.playlist(id));
  if (error)
    return (
      <Content>
        <EmptyState>playlist not found</EmptyState>
      </Content>
    );
  if (!playlist) return null;
  const songs = playlist.entry ?? [];
  const source = { kind: "playlist", name: playlist.name.split(" / ").at(-1) ?? playlist.name, href: `/playlist/${playlist.id}` };
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
        onPlay={() => player.play(songs, 0, { shuffle: false, source })}
        onShuffle={() => player.play(songs, -1, { shuffle: true, source })}
        onQueue={() => player.addToQueue(songs)}
        extra={<KeepOffline group={`playlist:${playlist.id}`} songs={songs} />}
      >
        <span className="text-muted-foreground">{[plural(songs.length, "track"), length(playlist.duration)].join(" · ")}</span>
        {playlist.comment && <Bio>{playlist.comment}</Bio>}
      </Hero>
      <Content>
        <TrackList songs={songs} source={source} filterable />
      </Content>
    </>
  );
}
