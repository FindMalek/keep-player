import { useEffect, useState } from "react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { player } from "@/lib/player";
import { go } from "@/lib/router";
import { api } from "@/lib/subsonic";
import type { Album, Artist, Song } from "@/lib/types";
import { Cover } from "./cover";

interface Results {
  artist?: Artist[];
  album?: Album[];
  song?: Song[];
}

function Row({ cover, title, sub }: { cover?: string; title: string; sub: string }) {
  return (
    <>
      <Cover id={cover} size={32} className="size-8 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px]">{title}</span>
        <span className="truncate text-muted-foreground text-xs">{sub}</span>
      </span>
    </>
  );
}

/** ⌘K: search the whole library; ↑↓ to move, enter to open or play, esc to close. Results come from the server, unfiltered here. */
export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<Results>({});

  useEffect(() => {
    const query = text.trim();
    if (!query) {
      setResults({});
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      api<{ searchResult3: Results }>("search3", { query, artistCount: 4, albumCount: 6, songCount: 8 })
        .then((response) => {
          if (!cancelled) setResults(response.searchResult3);
        })
        .catch(() => undefined);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [text]);

  const run = (action: () => void) => () => {
    action();
    onOpenChange(false);
  };
  const songs = results.song ?? [];

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="search"
      description="search artists, albums and songs"
      className="sm:max-w-[640px]"
    >
      <Command shouldFilter={false}>
        <CommandInput placeholder="search artists, albums, songs" value={text} onValueChange={setText} className="h-11 font-mono text-sm" />
        {text.trim() && (
          <CommandList className="max-h-[56vh]">
            <CommandEmpty className="font-mono text-faint">no matches</CommandEmpty>
            {(results.artist?.length ?? 0) > 0 && (
              <CommandGroup heading="artists">
                {results.artist?.map((artist) => (
                  <CommandItem key={artist.id} value={`ar-${artist.id}`} onSelect={run(() => go(`/artist/${artist.id}`))}>
                    <Row cover={artist.coverArt} title={artist.name} sub={`${artist.albumCount ?? 0} albums`} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {(results.album?.length ?? 0) > 0 && (
              <CommandGroup heading="albums">
                {results.album?.map((album) => (
                  <CommandItem key={album.id} value={`al-${album.id}`} onSelect={run(() => go(`/album/${album.id}`))}>
                    <Row cover={album.coverArt} title={album.name} sub={`${album.artist ?? ""}${album.year ? ` · ${album.year}` : ""}`} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {songs.length > 0 && (
              <CommandGroup heading="songs">
                {songs.map((song, index) => (
                  <CommandItem key={song.id} value={`so-${song.id}`} onSelect={run(() => player.play(songs, index))}>
                    <Row cover={song.coverArt} title={song.title} sub={`${song.artist ?? ""} · ${song.album ?? ""}`} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        )}
      </Command>
    </CommandDialog>
  );
}
