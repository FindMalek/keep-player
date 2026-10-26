import { Button } from "@keep/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { PlayIcon } from "lucide-react";
import { useEffect } from "react";
import { Aura } from "@/components/aura";
import { Section } from "@/components/library";
import { Link } from "@/components/link";
import { player } from "@/lib/player";
import { queries, queryClient } from "@/lib/queries";
import { rpc } from "@/lib/rpc";
import { api, getUser } from "@/lib/subsonic";
import type { Playlist, Song } from "@/lib/types";

interface Mix {
  id: string;
  name: string;
  description: string;
  songs: Song[];
}

const SAVED_KEY = "keep-player:mixes-saved";

/** The browser's local day and part of it: mixes turn over at your midnight, the daylist four times a day. */
function now() {
  const date = new Date();
  const tz = date.getTimezoneOffset();
  const hour = date.getHours();
  const slot = hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : hour >= 17 && hour < 22 ? "evening" : "night";
  return { day: Math.floor((date.getTime() - tz * 60_000) / 86_400_000), hour, tz, slot };
}

/**
 * Everything made for you as real Navidrome playlists ("daily mix 1"…, "discover weekly", "daylist"), replaced in place
 * when they turn over, so the phone and every other client has them too. Doing it twice just writes the same songs.
 * Returns the playlists it had to create, for the sidebar.
 */
async function saveAsPlaylists(stamp: string, mixes: Mix[]): Promise<Playlist[]> {
  try {
    if (localStorage.getItem(SAVED_KEY) === stamp) return [];
    localStorage.setItem(SAVED_KEY, stamp);
  } catch {
    return [];
  }
  const playlists = await api<{ playlists?: { playlist?: Playlist[] } }>("getPlaylists").catch(() => null);
  const mine = (playlists?.playlists?.playlist ?? []).filter((playlist) => playlist.owner === getUser());
  const created: Playlist[] = [];
  for (const mix of mixes) {
    const existing = mine.find((playlist) => playlist.name === mix.name);
    const songId = mix.songs.map((song) => song.id);
    const reply = await api<{ playlist?: { id: string } }>(
      "createPlaylist",
      existing ? { playlistId: existing.id, songId } : { name: mix.name, songId },
    ).catch(() => null);
    const id = existing?.id ?? reply?.playlist?.id;
    if (!existing && id)
      created.push({
        id,
        name: mix.name,
        owner: getUser() ?? undefined,
        comment: mix.description,
        songCount: mix.songs.length,
        duration: mix.songs.reduce((total, song) => total + (song.duration ?? 0), 0),
      });
    if (id) await api("updatePlaylist", { playlistId: id, comment: mix.description }).catch(() => undefined);
  }
  return created;
}

/** "made for you": daily mixes, Discover Weekly and the daylist on the home page; each card opens its playlist. */
export function MixRow() {
  const { day, hour, tz, slot } = now();
  const { data } = useQuery(
    rpc.mixes.queryOptions({
      input: { day, hour, tz },
      // An empty answer (no plays yet, or the index still building) is asked again on the next visit, never kept.
      staleTime: (query) => (query.state.data?.mixes.length ? 60 * 60_000 : 0),
      // Mixes change with the day and hour (the key), not while you're in another tab.
      refetchOnWindowFocus: false,
      select: (result) => result.mixes as Mix[],
    }),
  );
  // Read what the sidebar already has: mounting must not refetch it (that would bring back a playlist mid-undo).
  const playlists = useQuery({ ...queries.playlists(), refetchOnMount: false }).data;
  useEffect(() => {
    // New playlists go straight into the cached list: a refetch could undo a delete still waiting out its undo.
    if (!data?.length) return;
    void saveAsPlaylists(`${day}:${slot}`, data).then((created) => {
      if (created.length)
        queryClient.setQueryData(queries.playlists().queryKey, (current?: Playlist[]) => (current ? [...current, ...created] : current));
    });
  }, [data, day, slot]);
  // The cached list can predate the mixes being saved (playlists stay fresh for 30 s): add just the missing ones.
  const missing = playlists && data?.filter((mix) => !playlists.some((item) => item.name === mix.name && item.owner === getUser()));
  const missingNames = missing?.map((mix) => mix.name).join("\n") ?? "";
  useEffect(() => {
    if (!missingNames) return;
    const names = missingNames.split("\n");
    void api<{ playlists?: { playlist?: Playlist[] } }>("getPlaylists")
      .then((response) => {
        const found = (response.playlists?.playlist ?? []).filter((item) => names.includes(item.name) && item.owner === getUser());
        if (!found.length) return;
        queryClient.setQueryData(queries.playlists().queryKey, (current?: Playlist[]) =>
          current ? [...current, ...found.filter((item) => !current.some((known) => known.id === item.id))] : current,
        );
      })
      .catch(() => undefined);
  }, [missingNames]);
  if (!data?.length) return null;
  return (
    <Section title="made for you">
      <ul aria-label="made for you" className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {data.map((mix) => {
          const playlist = playlists?.find((item) => item.name === mix.name && item.owner === getUser());
          const href = playlist ? `/playlist/${playlist.id}` : undefined;
          const cover = (
            <span className="relative block aspect-square w-full overflow-hidden border">
              <Aura id={`${mix.id}-${day}`} songs={mix.songs} className="size-full" />
              <span className="absolute inset-0 flex items-end p-2 font-medium font-mono text-sm">{mix.name}</span>
            </span>
          );
          return (
            <li key={mix.id} className="group/mix relative flex flex-col gap-1">
              {href ? (
                <Link href={href} aria-label={mix.name}>
                  {cover}
                </Link>
              ) : (
                cover
              )}
              <Button
                size="icon-sm"
                aria-label={`play ${mix.name}`}
                className="absolute top-2 right-2 opacity-0 focus-visible:opacity-100 group-hover/mix:opacity-100"
                onClick={() => player.play(mix.songs, 0, { source: { kind: "playlist", name: mix.name, href } })}
              >
                <PlayIcon className="fill-current" />
              </Button>
              <span className="line-clamp-2 text-muted-foreground text-xs">{mix.description}</span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
