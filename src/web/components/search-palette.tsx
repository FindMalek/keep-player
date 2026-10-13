import { useEffect, useMemo, useRef, useState } from "react";
import { player } from "../lib/player";
import { go } from "../lib/router";
import { api } from "../lib/subsonic";
import type { Album, Artist, Song } from "../lib/types";
import { Cover } from "./cover";

interface Results {
  artist?: Artist[];
  album?: Album[];
  song?: Song[];
}

interface Item {
  key: string;
  kind: "artist" | "album" | "song";
  title: string;
  sub: string;
  cover?: string;
  run: () => void;
}

/** ⌘K: type to search the whole library; ↑↓ to move, enter to open or play, esc to close. */
export function SearchPalette({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<Results>({});
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const query = text.trim();
    if (!query) {
      setResults({});
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      api<{ searchResult3: Results }>("search3", { query, artistCount: 4, albumCount: 6, songCount: 8 })
        .then((response) => {
          if (cancelled) return;
          setResults(response.searchResult3);
          setSelected(0);
        })
        .catch(() => undefined);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [text]);

  const items = useMemo<Item[]>(() => {
    const close = (fn: () => void) => () => {
      fn();
      onClose();
    };
    return [
      ...(results.artist ?? []).map((artist) => ({
        key: `ar-${artist.id}`,
        kind: "artist" as const,
        title: artist.name,
        sub: `${artist.albumCount ?? 0} albums`,
        cover: artist.coverArt,
        run: close(() => go(`/artist/${artist.id}`)),
      })),
      ...(results.album ?? []).map((album) => ({
        key: `al-${album.id}`,
        kind: "album" as const,
        title: album.name,
        sub: `${album.artist ?? ""}${album.year ? ` · ${album.year}` : ""}`,
        cover: album.coverArt,
        run: close(() => go(`/album/${album.id}`)),
      })),
      ...(results.song ?? []).map((song, index, songs) => ({
        key: `so-${song.id}`,
        kind: "song" as const,
        title: song.title,
        sub: `${song.artist ?? ""} · ${song.album ?? ""}`,
        cover: song.coverArt,
        run: close(() => player.play(songs, index)),
      })),
    ];
  }, [results, onClose]);

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="search" onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={input}
          className="palette-input"
          placeholder="search artists, albums, songs"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected((value) => Math.min(items.length - 1, value + 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((value) => Math.max(0, value - 1));
            }
            if (event.key === "Enter") items[selected]?.run();
          }}
        />
        {text.trim() && (
          <ul className="palette-results" role="listbox">
            {items.length === 0 && <li className="palette-empty">no matches</li>}
            {items.map((item, index) => (
              <li key={item.key} role="option" aria-selected={index === selected}>
                <button type="button" className="palette-item" onMouseEnter={() => setSelected(index)} onClick={item.run}>
                  <Cover id={item.cover} size={32} />
                  <span className="palette-text">
                    <span className="ellipsis">{item.title}</span>
                    <span className="ellipsis muted small">{item.sub}</span>
                  </span>
                  <span className="chip">{item.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
