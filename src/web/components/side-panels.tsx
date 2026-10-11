import { useEffect, useMemo, useRef } from "react";
import { clock } from "../lib/format";
import { currentSong, player, usePlayer } from "../lib/player";
import { api } from "../lib/subsonic";
import type { StructuredLyrics } from "../lib/types";
import { useQuery } from "../lib/use-query";
import { Cover } from "./cover";
import { Close } from "./icons";

function PanelFrame({ title, meta, onClose, children }: { title: string; meta?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside className="side-panel" aria-label={title}>
      <header className="side-header">
        <h2>{title}</h2>
        {meta && <span className="muted">{meta}</span>}
        <button type="button" className="icon-button" onClick={onClose} aria-label={`close ${title}`}>
          <Close />
        </button>
      </header>
      <div className="side-body">{children}</div>
    </aside>
  );
}

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const state = usePlayer();
  const upcoming = state.queue.length - state.index - 1;

  return (
    <PanelFrame title="queue" meta={`${upcoming} up next`} onClose={onClose}>
      <ol className="queue">
        {state.queue.map((song, index) => (
          <li key={`${song.id}-${index}`} className={index === state.index ? "playing" : index < state.index ? "played" : undefined}>
            <button type="button" className="queue-item" onClick={() => player.jumpTo(index)}>
              <Cover id={song.coverArt} size={32} />
              <span className="queue-text">
                <span className="ellipsis">{song.title}</span>
                <span className="ellipsis muted small">{song.artist}</span>
              </span>
              <span className="num muted small">{clock(song.duration)}</span>
            </button>
            {index !== state.index && (
              <button type="button" className="icon-button remove" onClick={() => player.remove(index)} aria-label={`remove ${song.title}`}>
                <Close />
              </button>
            )}
          </li>
        ))}
      </ol>
      {state.queue.length > 0 && (
        <button type="button" className="text-button" onClick={player.clear}>
          clear queue
        </button>
      )}
    </PanelFrame>
  );
}

export function LyricsPanel({ onClose }: { onClose: () => void }) {
  const state = usePlayer();
  const song = currentSong(state);
  const { data, loading } = useQuery(song ? `lyrics:${song.id}` : null, () =>
    api<{ lyricsList?: { structuredLyrics?: StructuredLyrics[] } }>("getLyricsBySongId", { id: song?.id }),
  );
  const lyrics = useMemo(() => {
    const all = data?.lyricsList?.structuredLyrics ?? [];
    return all.find((entry) => entry.synced) ?? all[0];
  }, [data]);

  const positionMs = state.position * 1000;
  const active = lyrics?.synced ? lyrics.line.findLastIndex((line) => (line.start ?? 0) <= positionMs) : -1;
  const activeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  return (
    <PanelFrame title="lyrics" meta={lyrics ? (lyrics.synced ? "synced" : "plain") : undefined} onClose={onClose}>
      {!song ? (
        <p className="empty">nothing playing</p>
      ) : loading && !lyrics ? (
        <p className="empty">loading…</p>
      ) : !lyrics?.line.length ? (
        <p className="empty">no lyrics for this track</p>
      ) : (
        <div className={`lyrics${lyrics.synced ? " synced" : ""}`}>
          {lyrics.line.map((line, index) => (
            <p
              key={index}
              ref={index === active ? activeRef : undefined}
              className={index === active ? "active" : index < active ? "past" : undefined}
              onClick={() => lyrics.synced && line.start !== undefined && player.seek(line.start / 1000)}
            >
              {line.value || " "}
            </p>
          ))}
        </div>
      )}
    </PanelFrame>
  );
}
