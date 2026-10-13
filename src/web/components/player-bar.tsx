import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { clock, quality } from "../lib/format";
import { currentSong, player, usePlayer } from "../lib/player";
import { navigate } from "../lib/router";
import { Cover } from "./cover";
import { Lyrics, Next, Pause, Play, Previous, Queue, Repeat, Shuffle, Volume } from "./icons";

export type Panel = "queue" | "lyrics" | null;

/** A horizontal slider drawn as a flat bar; drag or click anywhere on it, arrow keys nudge it. */
function Slider({
  value,
  max,
  onChange,
  label,
  step,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  step: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? value;

  const valueAt = (event: PointerEvent<HTMLDivElement>): number => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || !max) return 0;
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * max;
  };

  return (
    <div
      ref={ref}
      className="slider"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(shown)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(valueAt(event));
      }}
      onPointerMove={(event) => dragging !== null && setDragging(valueAt(event))}
      onPointerUp={(event) => {
        if (dragging !== null) onChange(valueAt(event));
        setDragging(null);
      }}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === "ArrowRight") onChange(Math.min(max, value + step));
        if (event.key === "ArrowLeft") onChange(Math.max(0, value - step));
      }}
    >
      <div className="slider-track">
        <div className="slider-fill" style={{ width: `${max ? (shown / max) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

export function PlayerBar({ panel, onPanel }: { panel: Panel; onPanel: (panel: Panel) => void }) {
  const state = usePlayer();
  const song = currentSong(state);
  if (!song) return null;

  return (
    <footer className="player-bar">
      <div className="now">
        <Cover id={song.coverArt} size={42} className="now-cover" />
        <div className="now-text">
          <a className="now-title" href={song.albumId ? `/album/${song.albumId}` : "#"} onClick={navigate}>
            {song.title}
          </a>
          <a className="now-artist muted" href={song.artistId ? `/artist/${song.artistId}` : "#"} onClick={navigate}>
            {song.artist}
          </a>
        </div>
      </div>

      <div className="transport">
        <div className="controls">
          <button
            type="button"
            className={`icon-button${state.shuffle ? " on" : ""}`}
            onClick={player.toggleShuffle}
            aria-label="shuffle"
            aria-pressed={state.shuffle}
            title="shuffle (s)"
          >
            <Shuffle />
          </button>
          <button type="button" className="icon-button" onClick={player.previous} aria-label="previous" title="previous (shift ←)">
            <Previous />
          </button>
          <button
            type="button"
            className="play-button"
            onClick={() => player.toggle()}
            aria-label={state.playing ? "pause" : "play"}
            title="play / pause (space)"
          >
            {state.playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button type="button" className="icon-button" onClick={player.next} aria-label="next" title="next (shift →)">
            <Next />
          </button>
          <button
            type="button"
            className={`icon-button${state.repeat !== "off" ? " on" : ""}`}
            onClick={player.cycleRepeat}
            aria-label={`repeat ${state.repeat}`}
            title={`repeat: ${state.repeat} (r)`}
          >
            <Repeat one={state.repeat === "one"} />
          </button>
        </div>
        <div className="seek">
          <span className="num muted">{clock(state.position)}</span>
          <Slider value={state.position} max={state.duration} onChange={player.seek} label="seek" step={5} />
          <span className="num muted">{clock(state.duration)}</span>
        </div>
      </div>

      <div className="extras">
        <span className="quality muted">{state.buffering ? "loading…" : (state.error ?? quality(song.suffix, song.bitRate))}</span>
        <button
          type="button"
          className={`icon-button${panel === "lyrics" ? " on" : ""}`}
          onClick={() => onPanel(panel === "lyrics" ? null : "lyrics")}
          aria-label="lyrics"
          title="lyrics (l)"
        >
          <Lyrics />
        </button>
        <button
          type="button"
          className={`icon-button${panel === "queue" ? " on" : ""}`}
          onClick={() => onPanel(panel === "queue" ? null : "queue")}
          aria-label="queue"
          title="queue (q)"
        >
          <Queue />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={player.toggleMute}
          aria-label={state.muted ? "unmute" : "mute"}
          title="mute (m)"
        >
          <Volume muted={state.muted || state.volume === 0} />
        </button>
        <div className="volume">
          <Slider value={state.muted ? 0 : state.volume} max={1} onChange={player.setVolume} label="volume" step={0.05} />
        </div>
      </div>
    </footer>
  );
}
