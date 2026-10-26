"use client";

import { cn } from "@keep/ui/lib/utils";
import { AppWindowIcon, LaptopIcon, MonitorIcon, SearchIcon, Volume2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Art } from "./art";

/** Ticks while the page is visible and motion is welcome; `null` when motion is unwelcome (show the settled frame). */
function useTick(ms: number): number | null {
  const [tick, setTick] = useState<number | null>(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setTick(null);
    const id = setInterval(() => !document.hidden && setTick((now) => (now ?? 0) + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick;
}

// Placeholder lines in the song's spirit; the player shows the real ones, synced from your .lrc files or LRCLIB.
const LINES = [
  "the city hums below the glass",
  "a little light left in the hall",
  "we wait for morning, out of time",
  "and every song becomes a wall",
  "",
  "so play it once again for me",
];

export function LyricsDemo() {
  const active = (useTick(2200) ?? 1) % LINES.length;
  return (
    <div className="h-44 overflow-hidden border bg-card p-4" aria-hidden>
      <div
        className="flex flex-col gap-2 transition-transform duration-500"
        style={{ transform: `translateY(${-Math.max(0, active - 1) * 30}px)` }}
      >
        {LINES.map((line, index) => (
          <p
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed lines
            key={index}
            className={cn(
              "h-[22px] text-[15px] transition-colors duration-300",
              index === active ? "font-semibold text-foreground" : "text-muted-foreground/60",
            )}
          >
            {line || "♪"}
          </p>
        ))}
      </div>
    </div>
  );
}

const QUERY = "genre:metal year:1990..1999";
const RESULTS = [
  { title: "Them Bones", sub: "Alice in Chains · 1992", art: 1 },
  { title: "Rain When I Die", sub: "Alice in Chains · 1992", art: 3 },
  { title: "Planet Caravan", sub: "Pantera · 1994", art: 5 },
];

export function PaletteDemo() {
  const tick = useTick(110);
  const cycle = tick === null ? QUERY.length : tick % (QUERY.length + 30);
  const typed = QUERY.slice(0, cycle);
  const done = typed.length === QUERY.length;
  return (
    <div className="border bg-card" aria-hidden>
      <div className="flex items-center gap-2 border-b px-3 py-2.5 font-mono text-[13px]">
        <SearchIcon className="size-4 text-muted-foreground" />
        <span>
          {typed}
          <span className="ml-px inline-block h-4 w-px translate-y-0.5 animate-pulse bg-foreground" />
        </span>
      </div>
      <div className="flex flex-col p-1.5">
        {RESULTS.map((result, index) => (
          <div
            key={result.title}
            className={cn(
              "flex items-center gap-3 px-2 py-1.5 transition-opacity duration-300",
              index === 0 && done && "bg-muted",
              done ? "opacity-100" : "opacity-0",
            )}
          >
            <Art seed={result.art} className="size-8" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px]">{result.title}</span>
              <span className="truncate text-muted-foreground text-xs">{result.sub}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DEVICES = [
  { name: "chrome on mac", icon: LaptopIcon },
  { name: "the desktop app", icon: AppWindowIcon },
  { name: "firefox on linux", icon: MonitorIcon },
];

/** The device picker: playback moving from one of your browsers to the next, like spotify connect. */
export function DevicesDemo() {
  const playing = (useTick(2600) ?? 0) % DEVICES.length;
  return (
    <div className="border bg-card p-1.5" aria-hidden>
      {DEVICES.map((device, index) => (
        <div
          key={device.name}
          className={cn("flex items-center gap-3 px-2 py-2 transition-colors duration-300", index === playing && "bg-muted")}
        >
          <device.icon className="size-4 text-muted-foreground" strokeWidth={1.5} />
          <span className={cn("flex-1 text-[13px]", index === playing ? "font-medium" : "text-muted-foreground")}>{device.name}</span>
          {index === playing && <Volume2Icon className="size-4" strokeWidth={1.5} />}
        </div>
      ))}
    </div>
  );
}
