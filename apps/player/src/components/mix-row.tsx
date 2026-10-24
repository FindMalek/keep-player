import { useQuery } from "@tanstack/react-query";
import { PlayIcon } from "lucide-react";
import { useEffect } from "react";
import { Aura } from "@/components/aura";
import { Section } from "@/components/library";
import { player } from "@/lib/player";
import { api, getUser, HEADERS } from "@/lib/subsonic";
import type { Playlist, Song } from "@/lib/types";

interface Mix {
  id: string;
  name: string;
  description: string;
  songs: Song[];
}

const SAVED_KEY = "keep-player:mixes-saved";
/** The browser's local day, so a mix changes at your midnight and every device of yours gets the same one. */
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000);

/**
 * Today's mixes as real Navidrome playlists ("daily mix 1"…), replaced in place once a day, so Arpeggi and other
 * clients have them too. One browser doing it is enough; doing it twice just writes the same songs again.
 */
async function saveAsPlaylists(day: number, mixes: Mix[]): Promise<void> {
  try {
    if (localStorage.getItem(SAVED_KEY) === String(day)) return;
    localStorage.setItem(SAVED_KEY, String(day));
  } catch {
    return;
  }
  const playlists = await api<{ playlists?: { playlist?: Playlist[] } }>("getPlaylists").catch(() => null);
  const mine = (playlists?.playlists?.playlist ?? []).filter((playlist) => playlist.owner === getUser());
  for (const mix of mixes) {
    const existing = mine.find((playlist) => playlist.name === mix.name);
    const songId = mix.songs.map((song) => song.id);
    await api("createPlaylist", existing ? { playlistId: existing.id, songId } : { name: mix.name, songId }).catch(() => undefined);
    if (!existing) continue;
    await api("updatePlaylist", { playlistId: existing.id, comment: mix.description }).catch(() => undefined);
  }
}

/** "made for you": up to six mixes from the genres you play most, refreshed daily, on the home page. */
export function MixRow() {
  const day = today();
  const { data } = useQuery({
    queryKey: ["mixes", day],
    queryFn: async () => {
      const response = await fetch(`/api/mixes?day=${day}`, { headers: HEADERS });
      return response.ok ? ((await response.json()) as { mixes: Mix[] }).mixes : [];
    },
    // An empty answer (no plays yet, or the index still building) is asked again on the next visit, never kept.
    staleTime: (query) => (query.state.data?.length ? 60 * 60_000 : 0),
  });
  useEffect(() => {
    // No refetch of the playlist list here: it would undo a delete that is still waiting out its undo.
    if (data?.length) void saveAsPlaylists(day, data);
  }, [data, day]);
  if (!data?.length) return null;
  return (
    <Section title="made for you">
      <ul aria-label="daily mixes" className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {data.map((mix) => (
          <li key={mix.id}>
            <button
              type="button"
              aria-label={`play ${mix.name}`}
              className="group/mix flex w-full flex-col gap-1 text-left"
              onClick={() => player.play(mix.songs, 0, { source: { kind: "mix", name: mix.name } })}
            >
              <span className="relative block aspect-square w-full overflow-hidden border">
                <Aura id={`${mix.id}-${day}`} songs={mix.songs} className="size-full" />
                <span className="absolute inset-0 flex items-end p-2 font-medium font-mono text-sm">{mix.name}</span>
                <PlayIcon className="absolute right-2 bottom-2 hidden size-5 fill-current group-hover/mix:block" />
              </span>
              <span className="line-clamp-2 text-muted-foreground text-xs">{mix.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
