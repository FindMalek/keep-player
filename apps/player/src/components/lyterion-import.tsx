import { Progress } from "@keep/ui/components/progress";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Section } from "@/components/library";
import { plural } from "@/lib/format";
import { HEADERS } from "@/lib/subsonic";

interface Summary {
  playlists: { name: string; total: number; inLibrary: number; missing: { artist: string; title: string }[] }[];
}

/**
 * With Lyterion connected there's nothing to upload: it already syncs your Spotify playlists and likes into Navidrome.
 * This shows how far each one got and what's still missing (Lyterion keeps looking for those on every run).
 * Renders nothing without Lyterion, so the page falls back to the export file.
 */
export function LyterionImport() {
  const { data } = useQuery({
    queryKey: ["lyterion"],
    queryFn: async (): Promise<Summary | null> => {
      const response = await fetch("/api/lyterion", { headers: HEADERS });
      return response.ok ? ((await response.json()) as Summary) : null;
    },
  });
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return null;
  const total = data.playlists.reduce((sum, playlist) => sum + playlist.total, 0);
  const inLibrary = data.playlists.reduce((sum, playlist) => sum + playlist.inLibrary, 0);
  return (
    <Section title="from lyterion">
      <p className="mb-3 max-w-2xl text-muted-foreground text-sm">
        lyterion syncs your spotify playlists and liked songs into your library on its own. {inLibrary.toLocaleString()} of{" "}
        {plural(total, "song")} are in; it keeps looking for the rest on every run.
      </p>
      <ul aria-label="spotify playlists" className="flex max-w-2xl flex-col">
        {data.playlists
          .toSorted((a, b) => b.total - b.inLibrary - (a.total - a.inLibrary))
          .map((playlist) => (
            <li key={playlist.name} className="border-b py-2 last:border-b-0">
              <button
                type="button"
                className="flex w-full items-center gap-3 text-left"
                aria-expanded={open === playlist.name}
                onClick={() => setOpen(open === playlist.name ? null : playlist.name)}
              >
                <span className="min-w-0 flex-1 truncate text-sm">{playlist.name}</span>
                <span className="font-mono text-muted-foreground text-xs tabular-nums">
                  {playlist.inLibrary}/{playlist.total}
                </span>
                <Progress
                  value={playlist.total ? (playlist.inLibrary / playlist.total) * 100 : 100}
                  className="w-24"
                  aria-label={playlist.name}
                />
              </button>
              {open === playlist.name && playlist.missing.length > 0 && (
                <ul aria-label={`missing from ${playlist.name}`} className="mt-2 flex flex-col gap-0.5 pl-3">
                  {playlist.missing.map((song) => (
                    <li key={`${song.artist}-${song.title}`} className="truncate font-mono text-muted-foreground text-xs">
                      {song.artist} – {song.title}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
      </ul>
    </Section>
  );
}
