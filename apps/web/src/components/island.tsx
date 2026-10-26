"use client";

import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Art } from "./art";

const SONGS = [
  { title: "Teardrop", artist: "Massive Attack", length: 330, art: 2 },
  { title: "Avril 14th", artist: "Aphex Twin", length: 125, art: 0 },
  { title: "Svefn-g-englar", artist: "Sigur Rós", length: 604, art: 3 },
];

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function Bars({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span aria-hidden className={className} style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 14 }}>
      {[0.9, 0.62, 1.1, 0.75].map((speed, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: four fixed bars
          key={index}
          className="island-bar w-[3px] bg-white"
          style={{ animationDuration: `${speed}s`, animationPlayState: playing ? "running" : "paused", borderRadius: 2 }}
        />
      ))}
    </span>
  );
}

// The mac app's notch island (the real one is SwiftUI in apps/macos), rebuilt as a picture you can touch.
export function Island() {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState(94);
  const song = SONGS[index % SONGS.length] ?? SONGS[0];
  if (!song) throw new Error("no songs");

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setPosition((at) => (at + 1) % song.length), 1000);
    return () => clearInterval(id);
  }, [playing, song.length]);

  // Until someone touches it, the island shows itself off: open for a while, then back to the notch.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setOpen((now) => !now), 3200);
    const first = setTimeout(() => setOpen(true), 900);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [touched]);

  const skip = (by: number) => {
    setIndex((at) => (at + by + SONGS.length) % SONGS.length);
    setPosition(0);
    setPlaying(true);
  };

  return (
    <div className="island-screen relative mx-auto h-[230px] w-full max-w-[560px] overflow-hidden border border-b-0 sm:h-[280px]">
      <div className="absolute inset-x-0 top-0 flex h-7 items-center justify-between px-3 font-mono text-[10px] text-foreground/60">
        <span>keep music</span>
        <span>{new Date(0, 0, 1, 9, 41).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}</span>
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover only opens what the button opens too */}
      <div
        onMouseEnter={() => {
          setTouched(true);
          setOpen(true);
        }}
        // Keyboard too: the show-off toggle would close the island under a focused button.
        onFocusCapture={() => setTouched(true)}
        onMouseLeave={() => setOpen(false)}
        className="absolute top-0 left-1/2 -translate-x-1/2 overflow-hidden bg-black text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-[width,height] duration-300 ease-[cubic-bezier(0.3,1.3,0.5,1)]"
        style={{ width: open ? 340 : 236, height: open ? 150 : 32, borderRadius: open ? 26 : "0 0 14px 14px" }}
      >
        {open ? (
          <div className="flex h-full flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <Art seed={song.art} className="size-11" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-sm">{song.title}</span>
                <span className="truncate text-white/60 text-xs">{song.artist}</span>
              </div>
              <Bars playing={playing} />
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-white/60">
              {clock(position)}
              <span className="h-1 flex-1 bg-white/20" style={{ borderRadius: 2 }}>
                <span className="block h-full bg-white" style={{ width: `${(position / song.length) * 100}%`, borderRadius: 2 }} />
              </span>
              -{clock(song.length - position)}
            </div>
            <div className="flex items-center justify-center gap-6">
              <button type="button" aria-label="previous" onClick={() => skip(-1)}>
                <SkipBackIcon className="size-4 fill-white" />
              </button>
              <button type="button" aria-label={playing ? "pause" : "play"} onClick={() => setPlaying((now) => !now)}>
                {playing ? <PauseIcon className="size-5 fill-white" /> : <PlayIcon className="size-5 fill-white" />}
              </button>
              <button type="button" aria-label="next" onClick={() => skip(1)}>
                <SkipForwardIcon className="size-4 fill-white" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            aria-label="open the island"
            onClick={() => setOpen(true)}
            className="flex h-full w-full items-center justify-between px-3"
          >
            <Art seed={song.art} className="size-5" />
            <Bars playing={playing} />
          </button>
        )}
      </div>
      <p className="absolute inset-x-0 bottom-4 text-center font-mono text-[11px] text-foreground/45">hover the notch</p>
    </div>
  );
}
