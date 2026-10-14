import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { player } from "@/lib/player";
import { queries } from "@/lib/queries";
import { go } from "@/lib/router";
import { bindingsOf, useShortcutList } from "@/lib/shortcuts";
import type { Album, Artist, Song } from "@/lib/types";
import type { LyricsHit } from "../../shared/search";
import { Cover } from "./cover";
import { KeyCombo } from "./key-combo";

interface Results {
  artist?: Artist[];
  album?: Album[];
  song?: Song[];
}

/** The matched line with its matching words emphasized, between faint context lines. */
function LyricsSnippet({ hit }: { hit: LyricsHit }) {
  const parts: { text: string; match: boolean }[] = [];
  let at = 0;
  for (const [from, to] of hit.highlights) {
    if (from > at) parts.push({ text: hit.text.slice(at, from), match: false });
    parts.push({ text: hit.text.slice(from, to), match: true });
    at = to;
  }
  parts.push({ text: hit.text.slice(at), match: false });
  return (
    <span className="flex min-w-0 flex-col text-xs leading-snug">
      {hit.before && <span className="truncate text-faint">{hit.before}</span>}
      <span className="truncate text-muted-foreground">
        {parts.map((part, index) =>
          part.match ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
            <mark key={index} className="bg-transparent font-medium text-foreground">
              {part.text}
            </mark>
          ) : (
            part.text
          ),
        )}
      </span>
      {hit.after && <span className="truncate text-faint">{hit.after}</span>}
    </span>
  );
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
  const [query, setQuery] = useState("");
  // Wait for a pause in typing; cached queries (and the previous results meanwhile) keep it instant.
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 120);
    return () => clearTimeout(id);
  }, [text]);
  // "lyrics: words" searches lyrics only.
  const lyricsOnly = /^lyrics:/i.test(query);
  const words = lyricsOnly ? query.slice(7).trim() : query;
  const { data } = useQuery({
    ...queries.search(words),
    enabled: words.length > 0 && !lyricsOnly,
    placeholderData: (previous) => previous,
  });
  const results: Results = words && !lyricsOnly ? (data ?? {}) : {};
  const lyrics = useQuery({ ...queries.lyricsSearch(words), enabled: words.length >= 3, placeholderData: (previous) => previous }).data;
  const lyricHits = words.length >= 3 ? (lyrics?.hits ?? []) : [];

  const run = (action: () => void) => () => {
    action();
    onOpenChange(false);
  };
  const songs = results.song ?? [];
  const shortcuts = useShortcutList();
  const needle = text.trim().toLowerCase();
  // Commands from the shortcut registry, so the palette doubles as a command menu ("shuffle", "go to genres").
  // Commands only: seeking and volume steps are things you press, not things you look up.
  const actions = shortcuts
    .filter((shortcut) => !shortcut.passive && !/^(jump|seek|nudge|volume)-|^search$/.test(shortcut.id))
    .sort((a, b) => Number(b.group === "navigation") - Number(a.group === "navigation"))
    .filter((shortcut) => !needle || shortcut.label.includes(needle))
    .slice(0, needle ? 5 : 10);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="search"
      description="search artists, albums, songs and lyrics"
      className="sm:max-w-[640px]"
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="search artists, albums, songs, lyrics"
          value={text}
          onValueChange={setText}
          className="h-11 font-mono text-sm"
        />
        <CommandList className="max-h-[56vh]">
          {needle && <CommandEmpty className="font-mono text-faint">no matches</CommandEmpty>}
          {actions.length > 0 && (
            <CommandGroup heading="actions">
              {actions.map((shortcut) => {
                const binding = bindingsOf(shortcut)[0];
                return (
                  <CommandItem
                    key={shortcut.id}
                    value={`action-${shortcut.id}`}
                    onSelect={run(() => shortcut.run(new KeyboardEvent("keydown")))}
                  >
                    <span className="truncate">{shortcut.label}</span>
                    {binding && (
                      <CommandShortcut>
                        <KeyCombo binding={binding} />
                      </CommandShortcut>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          {needle && (
            <>
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
                    <CommandItem
                      key={song.id}
                      value={`so-${song.id}`}
                      onSelect={run(() => player.play(songs, index, { source: { kind: "search", name: `“${query}”` } }))}
                    >
                      <Row cover={song.coverArt} title={song.title} sub={`${song.artist ?? ""} · ${song.album ?? ""}`} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {lyricHits.length > 0 && (
                <CommandGroup heading="lyrics">
                  {lyricHits.map((hit) => {
                    const song = hit.song as unknown as Song;
                    return (
                      <CommandItem
                        key={song.id}
                        value={`ly-${song.id}`}
                        onSelect={run(() =>
                          player.play([song], 0, {
                            source: { kind: "search", name: `“${words}”` },
                            startAt: hit.start === null ? 0 : hit.start / 1000,
                          }),
                        )}
                      >
                        <Cover id={song.coverArt} size={32} className="size-8 shrink-0 self-start" />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-[13px]">
                            {song.title}
                            <span className="text-muted-foreground"> · {song.artist}</span>
                          </span>
                          <LyricsSnippet hit={hit} />
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
        {needle && lyrics && lyrics.checked < lyrics.total && (
          <p className="border-t px-3 py-1.5 font-mono text-[11px] text-faint">
            lyrics checked for {lyrics.checked.toLocaleString()} / {lyrics.total.toLocaleString()} songs so far
          </p>
        )}
      </Command>
    </CommandDialog>
  );
}
