import { Cover } from "../components/cover";
import { AlbumGrid, Empty, PageHeader, Section, TrackList } from "../components/library";
import { length, plural, quality } from "../lib/format";
import { player } from "../lib/player";
import { navigate } from "../lib/router";
import { api } from "../lib/subsonic";
import type { Album, Artist, ArtistInfo, Playlist, Song } from "../lib/types";
import { useQuery } from "../lib/use-query";

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
  kind: string;
  title: string;
  children: React.ReactNode;
  onPlay: () => void;
  onShuffle: () => void;
  onQueue: () => void;
}) {
  return (
    <header className="hero">
      <Cover id={cover} size={160} className="hero-cover" />
      <div className="hero-text">
        <span className="chip">{kind}</span>
        <h1>{title}</h1>
        <div className="hero-meta">{children}</div>
        <div className="hero-actions">
          <button type="button" className="button primary" onClick={onPlay}>
            play
          </button>
          <button type="button" className="button" onClick={onShuffle}>
            shuffle
          </button>
          <button type="button" className="button" onClick={onQueue}>
            add to queue
          </button>
        </div>
      </div>
    </header>
  );
}

export function AlbumPage({ id }: { id: string }) {
  const { data, error } = useQuery(`album:${id}`, () => api<{ album: Album }>("getAlbum", { id }));
  if (error) return <Empty>album not found</Empty>;
  const album = data?.album;
  if (!album) return null;
  const songs = album.song ?? [];
  const first = songs[0];
  const genres = album.genres?.map((genre) => genre.name) ?? (album.genre ? [album.genre] : []);

  return (
    <>
      <Hero
        cover={album.coverArt}
        kind="album"
        title={album.name}
        onPlay={() => player.play(songs, 0, { album: true, shuffle: false })}
        onShuffle={() => player.play(songs, 0, { shuffle: true })}
        onQueue={() => player.addToQueue(songs)}
      >
        <a href={album.artistId ? `/artist/${album.artistId}` : "#"} onClick={navigate} className="hero-artist">
          {album.artist}
        </a>
        <span className="muted">
          {[album.year, plural(songs.length, "track"), length(album.duration), first ? quality(first.suffix, first.bitRate) : ""]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {(genres.length > 0 || album.recordLabels?.length) && (
          <span className="hero-tags">
            {genres.map((genre) => (
              <a key={genre} href={`/genre/${encodeURIComponent(genre)}`} onClick={navigate} className="tag small">
                {genre.toLowerCase()}
              </a>
            ))}
            {album.recordLabels?.map((label) => (
              <span key={label.name} className="muted small">
                {label.name}
              </span>
            ))}
          </span>
        )}
      </Hero>
      <div className="content">
        <TrackList
          songs={songs}
          showAlbum={false}
          showArtist={songs.some((song) => song.artist !== album.artist)}
          numbered="track"
          asAlbum
        />
        {album.musicBrainzId && (
          <a
            className="muted small external"
            href={`https://musicbrainz.org/release/${album.musicBrainzId}`}
            target="_blank"
            rel="noreferrer"
          >
            musicbrainz ↗
          </a>
        )}
      </div>
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
  if (error) return <Empty>artist not found</Empty>;
  const artist = data?.artist;
  if (!artist) return null;
  const albums = [...(artist.album ?? [])].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const bio = info.data?.artistInfo2.biography?.replace(/<a [^>]*>.*?<\/a>\.?/g, "").trim();

  async function everything(shuffle: boolean): Promise<void> {
    const full = await Promise.all(albums.map((album) => api<{ album: Album }>("getAlbum", { id: album.id })));
    player.play(
      full.flatMap((response) => response.album.song ?? []),
      0,
      { shuffle },
    );
  }

  return (
    <>
      <Hero
        cover={artist.coverArt}
        kind="artist"
        title={artist.name}
        onPlay={() => void everything(false)}
        onShuffle={() => void everything(true)}
        onQueue={() =>
          void Promise.all(albums.map((album) => api<{ album: Album }>("getAlbum", { id: album.id }))).then((full) =>
            player.addToQueue(full.flatMap((r) => r.album.song ?? [])),
          )
        }
      >
        <span className="muted">{plural(albums.length, "album")}</span>
        {bio && <p className="bio">{bio}</p>}
      </Hero>
      <div className="content">
        {(top.data?.length ?? 0) > 0 && (
          <Section title="popular">
            <TrackList songs={top.data ?? []} showArtist={false} />
          </Section>
        )}
        <Section title="albums">
          <AlbumGrid albums={albums} />
        </Section>
      </div>
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
      <div className="content">
        <AlbumGrid albums={data ?? []} />
      </div>
    </>
  );
}

export function PlaylistPage({ id }: { id: string }) {
  const { data, error } = useQuery(`playlist:${id}`, () => api<{ playlist: Playlist }>("getPlaylist", { id }));
  if (error) return <Empty>playlist not found</Empty>;
  const playlist = data?.playlist;
  if (!playlist) return null;
  const songs = playlist.entry ?? [];
  const parts = playlist.name.split(" / ");

  return (
    <>
      <Hero
        cover={playlist.coverArt}
        kind="playlist"
        title={parts.at(-1) ?? playlist.name}
        onPlay={() => player.play(songs, 0, { shuffle: false })}
        onShuffle={() => player.play(songs, 0, { shuffle: true })}
        onQueue={() => player.addToQueue(songs)}
      >
        {parts.length > 1 && <span className="muted">{parts.slice(0, -1).join(" / ")}</span>}
        <span className="muted">{[plural(songs.length, "track"), length(playlist.duration)].join(" · ")}</span>
        {playlist.comment && <p className="bio">{playlist.comment}</p>}
      </Hero>
      <div className="content">
        <TrackList songs={songs} />
      </div>
    </>
  );
}
