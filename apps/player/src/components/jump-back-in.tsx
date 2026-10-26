import { Cover } from "@/components/cover";
import { Equalizer } from "@/components/equalizer";
import { Section } from "@/components/library";
import { Link } from "@/components/link";
import { usePlayer } from "@/lib/player";
import { useRecentSources } from "@/lib/recent-sources";
import { cn } from "@/lib/utils";

/** Spotify's "jump back in": the albums, playlists and artists you last played from, two lines of compact tiles. */
export function JumpBackIn() {
  const recent = useRecentSources();
  // The one playing right now says so, like the sidebar does.
  const playingHref = usePlayer((state) => state.queue.context.source?.href);
  const playing = usePlayer((state) => state.playing);
  if (!recent.length) return null;
  return (
    <Section title="jump back in">
      <ul aria-label="jump back in" className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
        {recent.map((source) => (
          <li key={source.href}>
            <Link
              href={source.href}
              aria-current={source.href === playingHref || undefined}
              className={cn(
                "flex h-12 items-center gap-3 border bg-card pr-3 hover:bg-accent",
                source.href === playingHref && "border-foreground",
              )}
            >
              <Cover id={source.coverArt ?? ""} size={48} className="size-12 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{source.name}</span>
                <span className="font-mono text-label text-muted-foreground">{source.kind}</span>
              </span>
              {source.href === playingHref && <Equalizer playing={playing} />}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
