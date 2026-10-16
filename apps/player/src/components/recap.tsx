import type { ListeningStats } from "@keep/shared/stats";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { plural } from "@/lib/format";
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

/** The story, one big fact per slide. */
function slides(stats: ListeningStats, label: string): { kicker: string; headline: string; detail?: string }[] {
  const [artist] = stats.top.artists;
  const [song] = stats.top.songs;
  const [genre] = stats.top.genres;
  const [album] = stats.top.albums;
  return [
    { kicker: label, headline: hours(stats.minutes), detail: `${plural(stats.plays, "play")} · ${plural(stats.songs, "different song")}` },
    ...(artist
      ? [
          {
            kicker: "your top artist",
            headline: artist.name,
            detail: `${plural(artist.plays, "play")} · ${hours(Math.round(artist.minutes))}`,
          },
        ]
      : []),
    ...(song ? [{ kicker: "your top song", headline: song.name, detail: `${song.detail ?? ""} · ${plural(song.plays, "play")}` }] : []),
    ...(album ? [{ kicker: "on repeat", headline: album.name, detail: album.detail }] : []),
    ...(genre
      ? [
          {
            kicker: "your sound",
            headline: genre.name.toLowerCase(),
            detail: stats.top.genres
              .slice(1, 4)
              .map((item) => item.name.toLowerCase())
              .join(" · "),
          },
        ]
      : []),
    {
      kicker: "new to you",
      headline: plural(stats.discovery.fresh, "song"),
      detail: `and ${plural(stats.discovery.familiar, "old favourite")}`,
    },
    {
      kicker: "longest streak",
      headline: plural(stats.streaks.longest, "day"),
      detail: stats.streaks.current ? `${plural(stats.streaks.current, "day")} and counting` : undefined,
    },
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

/** A monthly or yearly recap, any time of the year, story style; saved or shared as an image. */
export function Recap({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [period, setPeriod] = useState<Period>("month");
  const [index, setIndex] = useState(0);
  const range = periodRange(period);
  const { data } = useQuery({ ...statsQuery(range.from, range.to), enabled: open });
  const story = data ? slides(data, range.label) : [];
  const slide = story[Math.min(index, story.length - 1)];

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

  const step = (delta: number) => setIndex((current) => Math.max(0, Math.min(story.length - 1, current + delta)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") step(1);
          else if (event.key === "ArrowLeft") step(-1);
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-mono">recap</DialogTitle>
          <DialogDescription>your listening, any time of the year. ← → to go through it.</DialogDescription>
        </DialogHeader>
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
        <section aria-live="polite" aria-label="recap slide" className="flex min-h-56 flex-col justify-center gap-2 border p-6">
          {!data ? (
            <p className="font-mono text-muted-foreground text-sm">loading…</p>
          ) : data.plays === 0 ? (
            <p className="font-mono text-muted-foreground text-sm">
              nothing played here {period === "month" ? "this month" : "this year"} yet
            </p>
          ) : slide ? (
            <>
              <p className="font-mono text-muted-foreground text-xs">{slide.kicker}</p>
              <p className="text-balance font-medium text-3xl leading-tight">{slide.headline}</p>
              {slide.detail && <p className="text-muted-foreground text-sm">{slide.detail}</p>}
            </>
          ) : null}
        </section>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="previous" disabled={index === 0} onClick={() => step(-1)}>
              <ChevronLeftIcon />
            </Button>
            <span className="font-mono text-muted-foreground text-xs tabular-nums">
              {story.length ? `${Math.min(index, story.length - 1) + 1} / ${story.length}` : ""}
            </span>
            <Button variant="ghost" size="icon-sm" aria-label="next" disabled={index >= story.length - 1} onClick={() => step(1)}>
              <ChevronRightIcon />
            </Button>
          </div>
          <Button variant="outline" size="sm" disabled={!data?.plays} onClick={() => void save()}>
            <DownloadIcon />
            save image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
