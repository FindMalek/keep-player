import type { ListeningStats, StatItem } from "@keep/shared/stats";
import { Button } from "@keep/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@keep/ui/components/dialog";
import { ToggleGroup, ToggleGroupItem } from "@keep/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ListPlusIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { plural } from "@/lib/format";
import { notify } from "@/lib/notify";
import { player } from "@/lib/player";
import { createPlaylist } from "@/lib/playlists";
import { go } from "@/lib/router";
import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Aura } from "./aura";
import { statsQuery } from "./stats-query";

type Period = "month" | "year";

function periodRange(period: Period, now = new Date()): { from: number; to: number; label: string } {
  if (period === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      from: from.getTime(),
      to: to.getTime(),
      label: from.toLocaleDateString(undefined, { month: "long", year: "numeric" }).toLowerCase(),
    };
  }
  return {
    from: new Date(now.getFullYear(), 0, 1).getTime(),
    to: new Date(now.getFullYear() + 1, 0, 1).getTime(),
    label: String(now.getFullYear()),
  };
}

const hours = (minutes: number) => (minutes >= 120 ? `${Math.round(minutes / 60).toLocaleString()} hours` : plural(minutes, "minute"));

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

interface Slide {
  key: string;
  kicker: string;
  headline: string;
  detail?: string;
  /** A ranked list under the headline (top five). */
  list?: { name: string; detail?: string }[];
  /** Songs behind the slide: they seed its aura, and the last slide plays or saves them. */
  songs?: Song[];
}

const songsOf = (items: StatItem[]) => items.flatMap((item) => (item.song ? [item.song as unknown as Song] : []));

/** When you listen most: the hour and weekday with the most minutes, local time. */
function rhythm(clock: number[][]): { hour: number; weekday: number } | null {
  let best = { minutes: 0, hour: 0, weekday: 0 };
  const byHour = Array.from({ length: 24 }, (_, hour) => clock.reduce((sum, day) => sum + (day[hour] ?? 0), 0));
  const byDay = clock.map((day) => day.reduce((sum, minutes) => sum + minutes, 0));
  for (const [hour, minutes] of byHour.entries()) if (minutes > best.minutes) best = { ...best, minutes, hour };
  const weekday = byDay.indexOf(Math.max(...byDay));
  return best.minutes > 0 ? { hour: best.hour, weekday } : null;
}

const persona = (hour: number) =>
  hour >= 5 && hour < 12
    ? "a morning listener"
    : hour < 17 && hour >= 12
      ? "an afternoon listener"
      : hour < 22 && hour >= 17
        ? "an evening listener"
        : "a night owl";

/** The story, one big fact per slide. */
function slides(stats: ListeningStats, label: string): Slide[] {
  const [artist] = stats.top.artists;
  const [song] = stats.top.songs;
  const [genre] = stats.top.genres;
  const [album] = stats.top.albums;
  const topSongs = songsOf(stats.top.songs);
  const when = rhythm(stats.clock);
  const busiest = stats.days.reduce<{ day: string; minutes: number } | null>(
    (best, day) => (!best || day.minutes > best.minutes ? day : best),
    null,
  );
  const top5 = (items: StatItem[], detail: (item: StatItem) => string | undefined) =>
    items.slice(0, 5).map((item) => ({ name: item.name, detail: detail(item) }));
  return [
    {
      key: "minutes",
      kicker: `your ${label} in music`,
      headline: hours(stats.minutes),
      detail: `${plural(stats.plays, "play")} · ${plural(stats.songs, "different song")}`,
      songs: topSongs,
    },
    ...(artist
      ? [
          {
            key: "artist",
            kicker: "your top artist",
            headline: artist.name,
            detail: `${plural(artist.plays, "play")} · ${hours(Math.round(artist.minutes))}`,
            list: top5(stats.top.artists.slice(1), (item) => plural(item.plays, "play")),
            songs: topSongs.filter((item) => item.artist === artist.name),
          },
        ]
      : []),
    ...(song
      ? [
          {
            key: "song",
            kicker: "your top song",
            headline: song.name,
            detail: `${song.detail ?? ""} · ${plural(song.plays, "play")}`,
            list: top5(stats.top.songs.slice(1), (item) => item.detail),
            songs: topSongs.slice(0, 5),
          },
        ]
      : []),
    ...(album ? [{ key: "album", kicker: "on repeat", headline: album.name, detail: album.detail }] : []),
    ...(genre
      ? [
          {
            key: "genre",
            kicker: "your sound",
            headline: genre.name.toLowerCase(),
            detail: stats.top.genres
              .slice(1, 4)
              .map((item) => item.name.toLowerCase())
              .join(" · "),
          },
        ]
      : []),
    ...(when
      ? [
          {
            key: "rhythm",
            kicker: "you're",
            headline: persona(when.hour),
            detail: `most of it around ${when.hour}:00 · ${WEEKDAYS[when.weekday]}s the most`,
          },
        ]
      : []),
    ...(busiest && busiest.minutes > 0
      ? [
          {
            key: "busiest",
            kicker: "your biggest day",
            headline: new Date(`${busiest.day}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" }).toLowerCase(),
            detail: `${hours(Math.round(busiest.minutes))} in one day`,
          },
        ]
      : []),
    {
      key: "discovery",
      kicker: "new to you",
      headline: plural(stats.discovery.fresh, "song"),
      detail: `and ${plural(stats.discovery.familiar, "old favourite")}`,
    },
    {
      key: "streak",
      kicker: "longest streak",
      headline: plural(stats.streaks.longest, "day"),
      detail: stats.streaks.current ? `${plural(stats.streaks.current, "day")} and counting` : undefined,
    },
    { key: "end", kicker: `that was ${label}`, headline: "play it back", detail: "your top songs, in order", songs: topSongs },
  ];
}

/** Draws the whole recap on one portrait card in the theme's own colors, for saving or sharing. */
async function recapImage(stats: ListeningStats, label: string): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const font = getComputedStyle(document.body).fontFamily;
  const mono = token("--font-mono") || "monospace";
  context.fillStyle = token("--background");
  context.fillRect(0, 0, canvas.width, canvas.height);
  let y = 160;
  const line = (text: string, size: number, color: string, family = font, gap = 1.5) => {
    context.fillStyle = color;
    context.font = `${size}px ${family}`;
    let shown = text;
    while (context.measureText(shown).width > 940 && shown.length > 1) shown = `${shown.slice(0, -2)}…`;
    context.fillText(shown, 70, y);
    y += size * gap;
  };
  line(`keep music · ${label}`, 36, token("--muted-foreground"), mono, 3);
  for (const slide of slides(stats, label)) {
    line(slide.kicker, 34, token("--muted-foreground"), mono, 1.6);
    line(slide.headline, 84, token("--foreground"), font, 1.25);
    if (slide.detail) line(slide.detail, 34, token("--muted-foreground"), font, 2.4);
    else y += 50;
  }
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** A monthly or yearly recap as a reel: one fact per slide over its aura; tap the sides or use ← →. Saved as an image. */
export function Recap({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [period, setPeriod] = useState<Period>("month");
  const [index, setIndex] = useState(0);
  const range = periodRange(period);
  const { data } = useQuery({ ...statsQuery(range.from, range.to), enabled: open });
  const story = data?.plays ? slides(data, range.label) : [];
  const at = Math.min(index, Math.max(0, story.length - 1));
  const slide = story[at];
  const topSongs = data ? songsOf(data.top.songs) : [];

  async function save(): Promise<void> {
    if (!data) return;
    const blob = await recapImage(data, range.label);
    if (!blob) return;
    const file = new File([blob], `keep-music-recap-${range.label.replaceAll(" ", "-")}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `keep music · ${range.label}` }).catch(() => undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    const link = Object.assign(document.createElement("a"), { href: url, download: file.name });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function saveTopSongs(): Promise<void> {
    const id = await createPlaylist(`top songs · ${range.label}`, { songs: topSongs, comment: `your most played, ${range.label}` });
    if (id) notify({ message: `saved top songs · ${range.label}`, action: { label: "open", onClick: () => go(`/playlist/${id}`) } });
  }

  const step = (delta: number) => setIndex((current) => Math.max(0, Math.min(story.length - 1, current + delta)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(860px,calc(100dvh-2rem))] w-[min(480px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") step(1);
          else if (event.key === "ArrowLeft") step(-1);
        }}
      >
        <div className="z-10 flex flex-col gap-3 p-4 pb-0">
          {story.length > 0 && (
            <div className="flex gap-1 pr-8" aria-hidden>
              {story.map((item, i) => (
                <span key={item.key} className={cn("h-0.5 flex-1", i <= at ? "bg-foreground" : "bg-muted")} />
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 pr-8">
            <DialogTitle className="font-mono text-sm">recap</DialogTitle>
            <ToggleGroup
              variant="outline"
              size="sm"
              aria-label="recap period"
              value={[period]}
              onValueChange={(value: string[]) => {
                const next = value[0] as Period | undefined;
                if (next) {
                  setPeriod(next);
                  setIndex(0);
                }
              }}
            >
              <ToggleGroupItem value="month" className="font-mono font-normal">
                this month
              </ToggleGroupItem>
              <ToggleGroupItem value="year" className="font-mono font-normal">
                this year
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <DialogDescription className="sr-only">
            your listening, one slide at a time. ← → or tap the sides to go through it.
          </DialogDescription>
        </div>

        <section aria-live="polite" aria-label="recap slide" className="relative flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
          {slide && (
            <Aura id={`recap-${range.label}-${slide.key}`} songs={slide.songs ?? topSongs} className="absolute inset-0 size-full" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
          {story.length > 1 && (
            <>
              <button type="button" tabIndex={-1} aria-hidden className="absolute inset-y-0 left-0 w-1/3" onClick={() => step(-1)} />
              <button type="button" tabIndex={-1} aria-hidden className="absolute inset-y-0 right-0 w-2/3" onClick={() => step(1)} />
            </>
          )}
          <div className="pointer-events-none relative flex flex-col gap-2 p-6">
            {!data ? (
              <p className="font-mono text-muted-foreground text-sm">loading…</p>
            ) : data.plays === 0 ? (
              <p className="font-mono text-muted-foreground text-sm">
                nothing played here {period === "month" ? "this month" : "this year"} yet
              </p>
            ) : slide ? (
              <>
                <p className="font-mono text-muted-foreground text-xs">{slide.kicker}</p>
                <p className="text-balance font-medium text-4xl leading-tight">{slide.headline}</p>
                {slide.detail && <p className="text-muted-foreground text-sm">{slide.detail}</p>}
                {slide.list && slide.list.length > 0 && (
                  <ol className="mt-4 flex flex-col gap-1.5">
                    {slide.list.map((item, i) => (
                      <li key={item.name} className="flex items-baseline gap-3 text-sm">
                        <span className="w-4 font-mono text-muted-foreground text-xs tabular-nums">{i + 2}</span>
                        <span className="truncate">{item.name}</span>
                        {item.detail && <span className="truncate text-muted-foreground text-xs">{item.detail}</span>}
                      </li>
                    ))}
                  </ol>
                )}
                {slide.key === "end" && topSongs.length > 0 && (
                  <div className="pointer-events-auto mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => player.play(topSongs, 0, { source: { kind: "playlist", name: `top songs · ${range.label}` } })}
                    >
                      <PlayIcon className="fill-current" />
                      play them
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void saveTopSongs()}>
                      <ListPlusIcon />
                      save as playlist
                    </Button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </section>

        <footer className="z-10 flex items-center justify-between border-t p-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="previous" disabled={at === 0} onClick={() => step(-1)}>
              <ChevronLeftIcon />
            </Button>
            <span className="font-mono text-muted-foreground text-xs tabular-nums">
              {story.length ? `${at + 1} / ${story.length}` : ""}
            </span>
            <Button variant="ghost" size="icon-sm" aria-label="next" disabled={at >= story.length - 1} onClick={() => step(1)}>
              <ChevronRightIcon />
            </Button>
          </div>
          <Button variant="outline" size="sm" disabled={!data?.plays} onClick={() => void save()}>
            <DownloadIcon />
            save image
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
