import type { ReactNode } from "react";
import { clock } from "../lib/format";
import { currentSong, player, usePlayer } from "../lib/player";
import { navigate } from "../lib/router";
import { api } from "../lib/subsonic";
import type { Album, Song } from "../lib/types";
import { Cover } from "./cover";
import { Play, Plus, Queue } from "./icons";

export function PageHeader({ title, meta, children }: { title: string; meta?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-title">
        <h1>{title}</h1>
        {meta !== undefined && <span className="muted">{meta}</span>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <header className="section-header">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

async function playAlbum(id: string, shuffle = false): Promise<void> {
  const { album } = await api<{ album: Album }>("getAlbum", { id });
  player.play(album.song ?? [], 0, { album: true, shuffle });
}

export function AlbumGrid({ albums }: { albums: Album[] }) {
  if (!albums.length) return <Empty>no albums</Empty>;
  return (
    <ul className="album-grid">
      {albums.map((album) => (
        <li key={album.id} className="album-card">
          <a href={`/album/${album.id}`} onClick={navigate} className="album-link">
            <Cover id={album.coverArt} size={180} alt="" />
            <span className="album-name ellipsis">{album.name}</span>
            <span className="album-meta ellipsis muted">
              {album.artist}
              {album.year ? ` · ${album.year}` : ""}
            </span>
          </a>
          {/* A square layer over the cover, so the button sits on the cover's corner whatever the card width. */}
          <div className="cover-overlay">
            <button type="button" className="cover-play" onClick={() => void playAlbum(album.id)} aria-label={`play ${album.name}`}>
              <Play size={14} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface TrackListProps {
  songs: Song[];
  /** Columns to show; album pages hide album and artist when they are all the same. */
  showAlbum?: boolean;
  showArtist?: boolean;
  numbered?: "track" | "index";
  /** Plays as an album (album ReplayGain) when true. */
  asAlbum?: boolean;
}

export function TrackList({ songs, showAlbum = true, showArtist = true, numbered = "index", asAlbum = false }: TrackListProps) {
  const state = usePlayer();
  const playingId = currentSong(state)?.id;
  if (!songs.length) return <Empty>no tracks</Empty>;

  const multiDisc = new Set(songs.map((song) => song.discNumber ?? 1)).size > 1;
  let lastDisc: number | undefined;

  return (
    <div className={`track-list${showAlbum ? "" : " no-album"}`} role="table" aria-label="tracks">
      <div className="track-row track-head" role="row">
        <span>#</span>
        <span>title</span>
        {showAlbum && <span className="hide-narrow">album</span>}
        <span className="right">time</span>
        <span />
      </div>
      {songs.map((song, index) => {
        const disc = song.discNumber ?? 1;
        const discHeader = asAlbum && multiDisc && disc !== lastDisc;
        lastDisc = disc;
        const playing = song.id === playingId;
        return (
          <div key={`${song.id}-${index}`} role="rowgroup">
            {discHeader && <div className="disc-header">disc {disc}</div>}
            <div
              className={`track-row${playing ? " playing" : ""}`}
              role="row"
              tabIndex={0}
              onDoubleClick={() => player.play(songs, index, { album: asAlbum })}
              onKeyDown={(event) => event.key === "Enter" && player.play(songs, index, { album: asAlbum })}
            >
              <span className="num muted track-number">
                <span className="track-index">
                  {playing ? (
                    <span className={`eq${state.playing ? " on" : ""}`} aria-label={state.playing ? "playing" : "paused"}>
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : numbered === "track" ? (
                    (song.track ?? index + 1)
                  ) : (
                    index + 1
                  )}
                </span>
                <button type="button" className="track-play" onClick={() => player.play(songs, index, { album: asAlbum })} aria-label={`play ${song.title}`}>
                  <Play size={11} />
                </button>
              </span>
              <span className="track-title">
                <span className="ellipsis">{song.title}</span>
                {showArtist && (
                  <a className="ellipsis muted small" href={song.artistId ? `/artist/${song.artistId}` : "#"} onClick={navigate}>
                    {song.artist}
                  </a>
                )}
              </span>
              {showAlbum && (
                <a className="ellipsis muted hide-narrow" href={song.albumId ? `/album/${song.albumId}` : "#"} onClick={navigate}>
                  {song.album}
                </a>
              )}
              <span className="num muted right">{clock(song.duration)}</span>
              <span className="track-actions">
                <button type="button" className="icon-button" onClick={() => player.playNext([song])} aria-label={`play ${song.title} next`} title="play next">
                  <Queue />
                </button>
                <button type="button" className="icon-button" onClick={() => player.addToQueue([song])} aria-label={`add ${song.title} to queue`} title="add to queue">
                  <Plus />
                </button>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { playAlbum };
