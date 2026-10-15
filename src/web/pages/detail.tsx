import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, Trash2Icon } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { ArtistCard } from "@/components/artist-card";
import { Cover } from "@/components/cover";
import { EditableText } from "@/components/editable-text";
import { Hint } from "@/components/hint";
import { KeepOffline } from "@/components/keep-offline";
import { AlbumGrid, AlbumGridSkeleton, Content, EmptyState, type ListEditing, PageHeader, Section, TrackList } from "@/components/library";
import { LikeButton } from "@/components/like-button";
import { Link } from "@/components/link";
import { Delayed, HeroSkeleton, TrackListSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cachedSummary } from "@/lib/cached";
import { length, plural, quality } from "@/lib/format";
import type { LikeKind } from "@/lib/likes";
import { clearMorph, isMorphing } from "@/lib/motion";
import { player } from "@/lib/player";
import {
  canEdit,
  deletePlaylist,
  folderOf,
  hiddenQuery,
  leafOf,
  moveInPlaylist,
  moveToInPlaylist,
  removeFromPlaylist,
  reorderPlaylist,
  setHidden,
  updatePlaylist,
} from "@/lib/playlists";
import { queries, queryClient } from "@/lib/queries";
import { usePath } from "@/lib/router";
import type { Album, Artist, Playlist, Song } from "@/lib/types";

function Hero({
  cover,
  kind,
  title,
  titleSlot,
  children,
  onPlay,
  onShuffle,
  onQueue,
  extra,
  like,
  morph = false,
}: {
  cover?: string;
  kind: ReactNode;
  title: string;
  /** Shown instead of the plain title (an editable one). */
  titleSlot?: ReactNode;
  children: ReactNode;
  onPlay: () => void;
  onShuffle: () => void;
  onQueue: () => void;
  /** More actions after "add to queue" (keep offline). */
  extra?: ReactNode;
  /** A heart for albums and artists. */
  like?: { kind: LikeKind; id: string };
  /** Take over the clicked card's cover in the page transition. */
  morph?: boolean;
}) {
  return (
    <header className="flex items-end gap-5 border-b px-5 pt-[18px] pb-4">
      <div className="shrink-0" style={morph ? { viewTransitionName: "album-cover" } : undefined}>
        <Cover id={cover} size={160} className="w-[152px]" priority />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="self-start">{kind}</div>
        <h1 className="font-medium text-[26px] leading-[1.1] tracking-tight [overflow-wrap:anywhere]">{titleSlot ?? title}</h1>
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

/** Nothing cached to start from (a deep link, a reload): header and rows as placeholders. */
function DetailSkeleton() {
  return (
    <>
      <HeroSkeleton />
      <Content>
        <TrackListSkeleton count={12} />
      </Content>
    </>
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
  const [morph] = useState(() => isMorphing(id));
  // Cleared only after commit: a first render that suspends runs the initializer again and must still see it.
  useEffect(() => clearMorph(id), [id]);
  const {
    data: album,
    error,
    isPlaceholderData,
  } = useQuery({
    ...queries.album(id),
    // The card you clicked already knows the cover, title and track count: paint the header with them right away.
    placeholderData: () => cachedSummary<Album>(id, ["albumList", "albumPages", "starred", "artist", "search"]),
  });
  if (error)
    return (
      <Content>
        <EmptyState>album not found</EmptyState>
      </Content>
    );
  if (!album) return <DetailSkeleton />;
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
        morph={morph}
      >
        {album.artistId && (
          <ArtistCard id={album.artistId} name={album.artist}>
            <Link href={`/artist/${album.artistId}`} className="self-start font-medium underline-offset-3 hover:underline">
              {album.artist}
            </Link>
          </ArtistCard>
        )}
        <span className="text-muted-foreground">
          {[
            album.year,
            plural(album.songCount ?? songs.length, "track"),
            length(album.duration),
            first ? quality(first.suffix, first.bitRate) : "",
          ]
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
        {isPlaceholderData ? (
          <TrackListSkeleton count={album.songCount ?? 12} />
        ) : (
          <TrackList
            songs={songs}
            showAlbum={false}
            showArtist={songs.some((song) => song.artist !== album.artist)}
            numbered="track"
            asAlbum
            filterable
            source={source}
          />
        )}
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
  const {
    data: artist,
    error,
    isPlaceholderData,
  } = useQuery({
    ...queries.artist(id),
    placeholderData: () => cachedSummary<Artist>(id, ["artists", "starred", "search"]),
  });
  const info = useQuery(queries.artistInfo(id));
  const name = artist?.name;
  const top = useQuery({ ...queries.topSongs(name ?? ""), enabled: Boolean(name) });
  if (error)
    return (
      <Content>
        <EmptyState>artist not found</EmptyState>
      </Content>
    );
  if (!artist) return <DetailSkeleton />;
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
        <span className="text-muted-foreground">{plural(artist.albumCount ?? albums.length, "album")}</span>
        {/* Always three lines tall: the bio arrives after the header, and the header is bottom-aligned to the cover. */}
        <p className="line-clamp-3 h-[3lh] max-w-[72ch] text-[12.5px] text-muted-foreground">{bio}</p>
      </Hero>
      {/* Held open while loading (albums sit below it), so the grid doesn't jump when the top songs arrive. */}
      {(top.isPending || (top.data?.length ?? 0) > 0) && (
        <Section title="popular">
          {top.data ? <TrackList songs={top.data} showArtist={false} source={source} /> : <TrackListSkeleton count={10} immediate />}
        </Section>
      )}
      <Section title="albums">
        {isPlaceholderData ? <AlbumGridSkeleton count={artist.albumCount ?? 6} /> : <AlbumGrid albums={albums} />}
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
        {data ? (
          <AlbumGrid albums={data} />
        ) : (
          <Delayed>
            <AlbumGridSkeleton count={24} />
          </Delayed>
        )}
      </Content>
    </>
  );
}

const PLAYLIST_SORTS = [
  ["custom", "playlist order"],
  ["title", "title"],
  ["artist", "artist"],
  ["album", "album"],
  ["duration", "length"],
] as const;
type PlaylistSort = (typeof PLAYLIST_SORTS)[number][0];

function sortSongs(songs: Song[], sort: PlaylistSort): Song[] {
  if (sort === "custom") return songs;
  const sorted = [...songs];
  if (sort === "duration") return sorted.sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0));
  return sorted.sort((a, b) => (a[sort] ?? "").localeCompare(b[sort] ?? "", undefined, { sensitivity: "base" }));
}

export function PlaylistPage({ id }: { id: string }) {
  const {
    data: playlist,
    error,
    isPlaceholderData,
  } = useQuery({
    ...queries.playlist(id),
    placeholderData: () => cachedSummary<Playlist>(id, ["playlists"]),
  });
  const hiddenIds = useQuery(hiddenQuery(id)).data;
  const hidden = useMemo(() => new Set(hiddenIds ?? []), [hiddenIds]);
  const [sort, setSort] = useState<PlaylistSort>("custom");
  const path = usePath();
  const songs = playlist?.entry ?? [];
  const shown = useMemo(() => sortSongs(songs, sort), [songs, sort]);
  const editable = Boolean(playlist && canEdit(playlist) && !isPlaceholderData);
  const editing = useMemo<ListEditing | undefined>(
    () =>
      playlist && editable && sort === "custom"
        ? {
            remove: (indexes) => void removeFromPlaylist(playlist, indexes),
            move: (index, delta) => moveInPlaylist(playlist, index, delta),
            moveTo: (from, to) => moveToInPlaylist(playlist, from, to),
            hidden,
            toggleHidden: (song) => void setHidden(playlist.id, song.id, !hidden.has(song.id)),
          }
        : undefined,
    [playlist, editable, sort, hidden],
  );
  if (error)
    return (
      <Content>
        <EmptyState>playlist not found</EmptyState>
      </Content>
    );
  if (!playlist) return <DetailSkeleton />;
  const source = { kind: "playlist", name: leafOf(playlist.name), href: `/playlist/${playlist.id}` };
  const parts = playlist.name.split(" / ");
  const folder = folderOf(playlist.name);
  const playable = shown.filter((song) => !hidden.has(song.id));

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
        title={leafOf(playlist.name)}
        titleSlot={
          <EditableText
            label="playlist name"
            value={leafOf(playlist.name)}
            editable={editable}
            onSave={(name) => name && void updatePlaylist(playlist.id, { name: folder ? `${folder} / ${name}` : name })}
          />
        }
        onPlay={() => player.play(playable, 0, { shuffle: false, source })}
        onShuffle={() => player.play(playable, -1, { shuffle: true, source })}
        onQueue={() => player.addToQueue(playable)}
        extra={
          <>
            <KeepOffline group={`playlist:${playlist.id}`} songs={playable} />
            {editable ? (
              <>
                <Hint label={playlist.public ? "others on this server can see it" : "only you can see it"}>
                  <Label className="flex h-8 items-center gap-2 px-2 font-mono font-normal text-muted-foreground text-xs">
                    <Switch
                      checked={Boolean(playlist.public)}
                      onCheckedChange={(value) => void updatePlaylist(playlist.id, { public: value })}
                      aria-label="public"
                    />
                    public
                  </Label>
                </Hint>
                <Hint label="delete this playlist (undo for 10 s)">
                  <Button variant="ghost" size="icon" aria-label="delete playlist" onClick={() => deletePlaylist(playlist, path)}>
                    <Trash2Icon />
                  </Button>
                </Hint>
              </>
            ) : (
              <Badge variant="outline" className="h-8 font-mono font-normal text-muted-foreground">
                {playlist.readonly ? "smart playlist · read only" : `by ${playlist.owner}`}
              </Badge>
            )}
          </>
        }
      >
        <span className="text-muted-foreground">
          {[plural(playlist.songCount ?? songs.length, "track"), length(playlist.duration), hidden.size ? `${hidden.size} hidden` : ""]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <EditableText
          label="description"
          value={playlist.comment ?? ""}
          editable={editable}
          placeholder="add a description"
          onSave={(comment) => void updatePlaylist(playlist.id, { comment })}
          className="max-w-[72ch] text-[12.5px] text-muted-foreground"
        />
      </Hero>
      <Content>
        {isPlaceholderData ? (
          <TrackListSkeleton count={playlist.songCount || 12} />
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <ToggleGroup
                variant="outline"
                size="sm"
                aria-label="sort this view"
                value={[sort]}
                onValueChange={(value: string[]) => {
                  const next = value[0] as PlaylistSort | undefined;
                  if (next) setSort(next);
                }}
              >
                {PLAYLIST_SORTS.map(([value, label]) => (
                  <ToggleGroupItem key={value} value={value} className="font-mono font-normal">
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {sort !== "custom" && editable && (
                <Button
                  variant="link"
                  size="xs"
                  className="font-mono text-muted-foreground"
                  onClick={() => {
                    reorderPlaylist(playlist.id, shown);
                    setSort("custom");
                  }}
                >
                  make this the playlist order
                </Button>
              )}
            </div>
            <TrackList songs={shown} source={source} filterable editing={editing} />
          </>
        )}
      </Content>
    </>
  );
}
