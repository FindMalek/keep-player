import { Button } from "@keep/ui/components/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@keep/ui/components/hover-card";
import { useQuery } from "@tanstack/react-query";
import { PlayIcon } from "lucide-react";
import type { ReactElement } from "react";
import { player } from "@/lib/player";
import { queries } from "@/lib/queries";
import { Cover } from "./cover";

/** Loaded when the card opens, not for every artist link on the page. */
function ArtistPreview({ id, name }: { id: string; name: string }) {
  const info = useQuery(queries.artistInfo(id));
  const top = useQuery(queries.topSongs(name));
  // Last.fm bios are HTML with entities and a "read more" link: drop the link, keep the decoded text.
  const html = info.data?.biography?.replace(/<a [^>]*>.*?<\/a>\.?/g, "");
  const bio = html ? new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() : undefined;
  const first = top.data?.[0];
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-sm">{name}</span>
      {bio ? <p className="line-clamp-4 text-muted-foreground">{bio}</p> : info.isPending ? <span className="text-faint">…</span> : null}
      {first && (
        <Button
          variant="ghost"
          size="sm"
          className="-mx-1.5 justify-start gap-2 px-1.5 font-normal"
          onClick={() => player.play(top.data ?? [first], 0, { source: { kind: "artist", name, href: `/artist/${id}` } })}
        >
          <Cover id={first.coverArt} size={32} className="size-6 shrink-0" />
          <span className="truncate">{first.title}</span>
          <PlayIcon className="ml-auto" />
        </Button>
      )}
    </div>
  );
}

export function ArtistCard({ id, name, children }: { id: string; name?: string; children: ReactElement }) {
  if (!name) return children;
  return (
    <HoverCard>
      <HoverCardTrigger delay={500} render={children} />
      <HoverCardContent align="start" className="w-72">
        <ArtistPreview id={id} name={name} />
      </HoverCardContent>
    </HoverCard>
  );
}
