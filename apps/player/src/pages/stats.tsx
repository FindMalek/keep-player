import type { StatItem } from "@keep/shared/stats";
import { Button } from "@keep/ui/components/button";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@keep/ui/components/chart";
import { Input } from "@keep/ui/components/input";
import { ToggleGroup, ToggleGroupItem } from "@keep/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { ListPlusIcon, PlayIcon, SparklesIcon } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Content, EmptyState, PageHeader, Section, TrackList } from "@/components/library";
import { Link } from "@/components/link";
import { TrackListSkeleton } from "@/components/skeletons";
import { statsQuery } from "@/components/stats-query";
import { plural } from "@/lib/format";
import { player } from "@/lib/player";
import { createPlaylist } from "@/lib/playlists";
import { go } from "@/lib/router";
import { api, getUser, HEADERS } from "@/lib/subsonic";
import type { Song } from "@/lib/types";

const Recap = lazy(() => import("@/components/recap").then((module) => ({ default: module.Recap })));

const DAY = 86_400_000;
const RANGES = [
  ["week", "7 days", 7],
  ["month", "30 days", 30],
  ["year", "year", 365],
  ["custom", "custom", 0],
] as const;
type Range = (typeof RANGES)[number][0];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const chartConfig = { minutes: { label: "minutes", color: "var(--chart-1)" } } satisfies ChartConfig;

const startOfDay = (time: number) => {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
};
const dateInput = (time: number) => new Date(time - new Date(time).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const fromInput = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).getTime();
};

/** One figure with what it counts underneath, so nothing needs hovering to be understood. Equal tiles in a grid. */
function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border p-3">
      <dt className="font-mono text-muted-foreground text-xs">{label}</dt>
      <dd className="font-mono text-xl tabular-nums">{value}</dd>
      <dd className="truncate text-muted-foreground text-xs" title={note}>
        {note}
      </dd>
    </div>
  );
}

function TopList({ title, items, href }: { title: string; items: StatItem[]; href?: (item: StatItem) => string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="font-mono text-muted-foreground text-xs">{title}</h3>
      {items.length === 0 ? (
        <p className="font-mono text-muted-foreground text-sm">—</p>
      ) : (
        <ol className="flex flex-col">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-baseline gap-2 py-1 text-sm">
              <span className="w-4 shrink-0 text-right font-mono text-muted-foreground text-xs tabular-nums">{index + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">
                  {href ? (
                    <Link href={href(item)} className="hover:underline">
                      {item.name}
                    </Link>
                  ) : item.song ? (
                    <button
                      type="button"
                      className="max-w-full truncate hover:underline"
                      onClick={() =>
                        player.play([item.song as unknown as Song], 0, { source: { kind: "stats", name: "stats", href: "/stats" } })
                      }
                    >
                      {item.name}
                    </button>
                  ) : (
                    item.name
                  )}
                </span>
                {item.detail && <span className="truncate text-muted-foreground text-xs">{item.detail}</span>}
              </span>
              <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">{item.plays}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Minutes by weekday × hour; darker is more. Grey only: the foreground at an opacity. */
function ListeningClock({ clock }: { clock: number[][] }) {
  const max = Math.max(1, ...clock.flat());
  return (
    <div className="flex flex-col gap-1 overflow-x-auto" role="img" aria-label="listening clock: minutes by weekday and hour">
      {clock.map((hours, day) => (
        <div key={WEEKDAYS[day]} className="flex items-center gap-1">
          <span className="w-8 shrink-0 font-mono text-muted-foreground text-xs">{WEEKDAYS[day]}</span>
          {hours.map((minutes, hour) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: the hour is the identity
              key={hour}
              title={`${WEEKDAYS[day]} ${hour}:00 · ${minutes} min`}
              className="size-3.5 shrink-0 bg-foreground sm:size-4"
              style={{ opacity: minutes ? 0.12 + 0.88 * (minutes / max) : 0.05 }}
            />
          ))}
        </div>
      ))}
      <div className="flex gap-1 pl-9 font-mono text-muted-foreground text-xs">
        {[0, 6, 12, 18].map((hour) => (
          <span key={hour} className="w-[calc(6*1.125rem)] sm:w-[calc(6*1.25rem)]">
            {hour}h
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1 pl-9 font-mono text-muted-foreground text-xs" aria-hidden>
        less
        {[0.05, 0.3, 0.55, 0.8, 1].map((opacity) => (
          <span key={opacity} className="size-3.5 bg-foreground sm:size-4" style={{ opacity }} />
        ))}
        more · {max} min at most
      </div>
    </div>
  );
}

/** `g t`: your listening, any range, from what you played here. */
export function StatsPage() {
  const [range, setRange] = useState<Range>("month");
  const today = startOfDay(Date.now());
  const [custom, setCustom] = useState({ from: today - 29 * DAY, to: today });
  const [recapOpen, setRecapOpen] = useState(false);
  const days = RANGES.find(([value]) => value === range)?.[2] ?? 30;
  const from = range === "custom" ? custom.from : today - (days - 1) * DAY;
  const to = range === "custom" ? custom.to + DAY : today + DAY;
  const stats = useQuery(statsQuery(from, to));
  const forgotten = useQuery({
    queryKey: ["forgotten"],
    queryFn: async (): Promise<Song[]> => {
      const response = await fetch("/api/stats/forgotten?days=60", { headers: HEADERS });
      if (!response.ok) throw new Error(`forgotten: ${response.status}`);
      return ((await response.json()) as { songs: Song[] }).songs;
    },
    staleTime: 60_000,
  });
  const scrobbling = useQuery({
    queryKey: ["scrobbling"],
    queryFn: async () =>
      (await api<{ user?: { scrobblingEnabled?: boolean } }>("getUser", { username: getUser() ?? "" })).user?.scrobblingEnabled ?? null,
    staleTime: 60 * 60_000,
  });
  const data = stats.data;
  const chartDays = useMemo(() => data?.days.map((day) => ({ ...day, label: day.day.slice(5) })) ?? [], [data]);

  async function playlistFromForgotten(): Promise<void> {
    const songs = forgotten.data ?? [];
    const id = await createPlaylist(
      `forgotten favourites · ${new Date().toLocaleDateString(undefined, { month: "short", year: "numeric" }).toLowerCase()}`,
      {
        songs,
      },
    );
    if (id) go(`/playlist/${encodeURIComponent(id)}`);
  }

  return (
    <>
      <PageHeader title="stats" meta={data ? `${plural(data.minutes, "minute")} · ${plural(data.plays, "play")}` : undefined}>
        <Button variant="outline" size="sm" onClick={() => setRecapOpen(true)}>
          <SparklesIcon />
          recap
        </Button>
      </PageHeader>
      <Content>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label="range"
            value={[range]}
            onValueChange={(value: string[]) => {
              const next = value[0] as Range | undefined;
              if (next) setRange(next);
            }}
          >
            {RANGES.map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} className="font-mono font-normal">
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {range === "custom" && (
            <div className="flex items-center gap-1 font-mono text-sm">
              <Input
                type="date"
                aria-label="from"
                className="h-7 w-36"
                value={dateInput(custom.from)}
                max={dateInput(custom.to)}
                onChange={(event) => event.target.value && setCustom((current) => ({ ...current, from: fromInput(event.target.value) }))}
              />
              <span className="text-muted-foreground">→</span>
              <Input
                type="date"
                aria-label="to"
                className="h-7 w-36"
                value={dateInput(custom.to)}
                min={dateInput(custom.from)}
                onChange={(event) => event.target.value && setCustom((current) => ({ ...current, to: fromInput(event.target.value) }))}
              />
            </div>
          )}
        </div>
        {stats.isError ? (
          <EmptyState>couldn't read your stats</EmptyState>
        ) : !data ? (
          <TrackListSkeleton count={6} />
        ) : data.plays + data.skips === 0 ? (
          <EmptyState>nothing played here in this range · what you play here shows up as stats</EmptyState>
        ) : (
          <div className="flex flex-col gap-6">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="minutes" value={data.minutes.toLocaleString()} note="listened in this range" />
              <Stat label="plays" value={data.plays.toLocaleString()} note="skips (under 30 s) not counted" />
              <Stat label="songs" value={data.songs.toLocaleString()} note="different songs played" />
              <Stat
                label="new to you"
                value={`${data.songs ? Math.round((data.discovery.fresh / data.songs) * 100) : 0}%`}
                note={`${data.discovery.fresh} of ${data.songs} first heard here`}
              />
              <Stat label="streak" value={plural(data.streaks.current, "day")} note={`longest ${plural(data.streaks.longest, "day")}`} />
              <Stat label="skips" value={data.skips.toLocaleString()} note="left within 30 s" />
            </dl>
            <ChartContainer config={chartConfig} className="aspect-auto h-40 w-full">
              <BarChart data={chartDays} margin={{ left: 0, right: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
                <Bar dataKey="minutes" fill="var(--color-minutes)" isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              <TopList title="top songs" items={data.top.songs} />
              <TopList title="top artists" items={data.top.artists} href={(item) => `/artist/${encodeURIComponent(item.id)}`} />
              <TopList title="top albums" items={data.top.albums} href={(item) => `/album/${encodeURIComponent(item.id)}`} />
              <TopList title="top genres" items={data.top.genres} href={(item) => `/genre/${encodeURIComponent(item.name)}`} />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="font-mono text-muted-foreground text-xs">listening clock · minutes by weekday and hour</h3>
              <ListeningClock clock={data.clock} />
            </div>
          </div>
        )}
      </Content>
      <Section
        title="forgotten favourites"
        action={
          (forgotten.data?.length ?? 0) > 0 ? (
            <div className="flex gap-3">
              <Button
                variant="link"
                size="xs"
                className="h-auto gap-1 p-0 font-mono text-muted-foreground"
                onClick={() =>
                  player.play(forgotten.data ?? [], 0, { source: { kind: "stats", name: "forgotten favourites", href: "/stats" } })
                }
              >
                <PlayIcon /> play
              </Button>
              <Button
                variant="link"
                size="xs"
                className="h-auto gap-1 p-0 font-mono text-muted-foreground"
                onClick={() => void playlistFromForgotten()}
              >
                <ListPlusIcon /> make a playlist
              </Button>
            </div>
          ) : undefined
        }
      >
        {forgotten.isPending ? (
          <TrackListSkeleton count={4} />
        ) : (forgotten.data?.length ?? 0) === 0 ? (
          <EmptyState>songs you played a lot and not in 60 days show up here</EmptyState>
        ) : (
          <TrackList songs={forgotten.data ?? []} source={{ kind: "stats", name: "forgotten favourites", href: "/stats" }} />
        )}
      </Section>
      <Content>
        <p className="font-mono text-muted-foreground text-xs">
          {scrobbling.data === true
            ? "scrobbling is on in navidrome: your plays also go to listenbrainz / last.fm."
            : scrobbling.data === false
              ? "scrobbling is off in navidrome. turn it on in navidrome's personal settings to send plays to listenbrainz or last.fm."
              : null}
        </p>
      </Content>
      {recapOpen && (
        <Suspense>
          <Recap open={recapOpen} onOpenChange={setRecapOpen} />
        </Suspense>
      )}
    </>
  );
}
