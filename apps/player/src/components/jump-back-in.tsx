import { Cover } from "@/components/cover";
import { Section } from "@/components/library";
import { Link } from "@/components/link";
import { useRecentSources } from "@/lib/recent-sources";

/** Spotify's "jump back in": the albums, playlists and artists you last played from, two lines of compact tiles. */
export function JumpBackIn() {
  const recent = useRecentSources();
  if (!recent.length) return null;
  return (
    <Section title="jump back in">
      <ul aria-label="jump back in" className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
        {recent.map((source) => (
          <li key={source.href}>
            <Link href={source.href} className="flex h-12 items-center gap-3 border bg-card pr-3 hover:bg-accent">
              <Cover id={source.coverArt ?? ""} size={48} className="size-12 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm">{source.name}</span>
                <span className="font-mono text-[10.5px] text-muted-foreground">{source.kind}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
