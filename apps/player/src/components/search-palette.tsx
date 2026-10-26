import { normalize } from "@keep/shared/normalize";
import { parseQuery } from "@keep/shared/search-query";
import { Badge } from "@keep/ui/components/badge";
import { Button } from "@keep/ui/components/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@keep/ui/components/command";
import { useQuery } from "@tanstack/react-query";
import { ClockIcon, PlayIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiQueries } from "@/lib/api-queries";
import { player, usePlayer } from "@/lib/player";
import { queries } from "@/lib/queries";
import { go } from "@/lib/router";
import {
  openResult,
  playLyricsHit,
  playResult,
  type ResultKind,
  recentSearches,
  rememberSearch,
  resultSubtitle,
  resultTarget,
  resultTitle,
} from "@/lib/search-actions";
import { bindingsOf, useShortcutList } from "@/lib/shortcuts";
import type { Song } from "@/lib/types";
import { isLink } from "@/lib/wishlist";
import { AddTrack } from "./add-track";
import { Cover } from "./cover";
import { ListContextMenu, type MenuTarget } from "./item-menu";
import { KeyCombo } from "./key-combo";
import { LyricsSnippet } from "./lyrics-snippet";
import { ResultGroupSkeleton } from "./skeletons";

/** Typing pauses shorter than this don't send a request; the previous results stay up meanwhile. */
const DEBOUNCE_MS = 30;

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

export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  // Adding a song replaces the results: the same box, but the text becomes what to look for.
  const [adding, setAdding] = useState<string | null>(null);
  const canAdd = useQuery({ ...apiQueries.session(), enabled: open }).data?.lyterionAdd === true;
  useEffect(() => {
    if (!open) setAdding(null);
  }, [open]);
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text]);
  const parsed = useMemo(() => parseQuery(text), [text]);
  const active = useMemo(() => parseQuery(query), [query]);

  const { data, isPending: searching } = useQuery({
    ...apiQueries.search(query),
    enabled: query.length > 0 && !active.lyricsOnly,
    placeholderData: (previous) => previous,
  });
  const results = query && !active.lyricsOnly ? data : undefined;
  const lyricsWords = active.text;
  const lyricsWanted = lyricsWords.length >= 3 && (active.lyricsOnly || !active.chips.length);
  const lyricsQuery = useQuery({ ...apiQueries.lyricsSearch(lyricsWords), enabled: lyricsWanted, placeholderData: (previous) => previous });
  const lyrics = lyricsQuery.data;
  const lyricHits = lyricsWanted ? (lyrics?.hits ?? []) : [];
  const playlistsData = useQuery({ ...queries.playlists(), enabled: open }).data;
  const playlists = useMemo(() => {
    const wanted = normalize(active.text);
    if (!wanted || active.lyricsOnly || active.chips.length) return [];
    return (playlistsData ?? []).filter((playlist) => normalize(playlist.name).includes(wanted)).slice(0, 4);
  }, [playlistsData, active]);
  const history = usePlayer((state) => state.queue.history);

  // New results start at the top with the first one selected; cmdk would keep the old scroll and selection.
  const [selected, setSelected] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs whenever the results change
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    setSelected(list.querySelector("[cmdk-item]")?.getAttribute("data-value") ?? "");
    for (let element: HTMLElement | null = list; element && element.role !== "dialog"; element = element.parentElement)
      if (element.scrollTop > 0) element.scrollTop = 0;
  }, [query, results, lyrics, open]);

  // ⌘↵ or the footer link: the full results page. Not a list item, so it never steals enter from the results.
  const seeAll = () => {
    rememberSearch(text);
    go(`/search?${new URLSearchParams({ q: text.trim() })}`);
    onOpenChange(false);
  };
  const run = (action: () => void) => () => {
    rememberSearch(text);
    action();
    onOpenChange(false);
  };
  const needle = text.trim().toLowerCase();
  const shortcuts = useShortcutList();
  // Commands from the shortcut registry, so the palette doubles as a command menu ("shuffle", "go to genres").
  const actions = shortcuts
    .filter((shortcut) => !shortcut.passive && !/^(jump|seek|nudge|volume)-|^search$/.test(shortcut.id))
    .sort((a, b) => Number(b.group === "navigation") - Number(a.group === "navigation"))
    .filter((shortcut) => !needle || shortcut.label.includes(needle))
    .slice(0, needle ? 5 : 6);

  const recent = needle ? [] : recentSearches().slice(0, 5);
  const played = needle
    ? []
    : [...new Map([...history].reverse().map((entry) => [entry.song.id, entry.song] as const)).values()].slice(0, 5);
  const top = results?.top;
  const songs = (results?.songs ?? []).filter((song) => !(top?.kind === "song" && song.id === top.item.id)) as unknown as Song[];
  const groups: [ResultKind, Record<string, unknown>[]][] = [
    ["album", results?.albums ?? []],
    ["artist", results?.artists ?? []],
  ];

  // A pasted link puts "add" first; a name offers it after what you already have.
  // Only once results settled: cmdk keeps whatever item came first selected, and enter must never add by surprise.
  const settled =
    !needle || isLink(text) || (query.toLowerCase() === needle && !(query && !active.lyricsOnly && searching) && !lyricsQuery.isFetching);
  const addItem = canAdd && settled && (
    <CommandGroup heading="add to library">
      <CommandItem value="add-track" onSelect={() => setAdding(text.trim())}>
        <PlusIcon className="text-muted-foreground" />
        <span className="truncate">{needle ? `add “${text.trim()}” to your library` : "add a song from a link or a name"}</span>
      </CommandItem>
    </CommandGroup>
  );
  const addFirst = needle && isLink(text);

  const targets = new Map<string, MenuTarget>();
  for (const song of played) targets.set(`played-${song.id}`, { kind: "songs", songs: [song] });
  if (top) targets.set(`top-${top.item.id}`, resultTarget(top.kind, top.item));
  for (const song of songs) targets.set(`so-${song.id}`, { kind: "songs", songs: [song] });
  for (const [kind, items] of groups) for (const item of items) targets.set(`${kind}-${item.id}`, resultTarget(kind, item));
  for (const playlist of playlists) targets.set(`pl-${playlist.id}`, { kind: "playlist", playlist });
  for (const hit of lyricHits)
    targets.set(`ly-${(hit.song as unknown as Song).id}`, { kind: "songs", songs: [hit.song as unknown as Song] });
  const menuTarget = (element: Element) => targets.get(element.closest("[data-value]")?.getAttribute("data-value") ?? "") ?? null;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="search"
      description="search artists, albums, songs, playlists and lyrics"
      // In the middle of any window, one height whatever the results (so the input never moves); only the list scrolls.
      className="top-1/2 flex h-[min(calc(100dvh-2rem),32rem)] -translate-y-1/2 flex-col sm:max-w-[680px]"
    >
      {adding !== null ? (
        <AddTrack initial={adding} onBack={() => setAdding(null)} onClose={() => onOpenChange(false)} />
      ) : (
        <Command
          className="min-h-0 flex-1"
          shouldFilter={false}
          loop
          value={selected}
          onValueChange={setSelected}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && text.trim()) {
              event.preventDefault();
              seeAll();
            }
          }}
        >
          <CommandInput
            placeholder="search, or try artist: year:1990..1999 is:liked lyrics:"
            value={text}
            onValueChange={setText}
            className="h-11 font-mono text-sm"
          />
          {parsed.chips.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b px-3 py-1.5">
              {parsed.chips.map((chip) => (
                <Badge key={chip.raw} variant="outline" className="gap-1 font-mono font-normal">
                  {chip.key}: {chip.value}
                  <button
                    type="button"
                    aria-label={`remove ${chip.key} filter`}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setText(text.replace(chip.raw, "").replace(/\s+/g, " ").trim())}
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <ListContextMenu resolve={menuTarget}>
            <CommandList ref={listRef} className="max-h-none min-h-0 flex-1">
              {needle && !(searching && query) && <CommandEmpty className="font-mono text-faint">no matches</CommandEmpty>}
              {query && !active.lyricsOnly && searching && <ResultGroupSkeleton />}
              {addFirst && addItem}
              {recent.length > 0 && (
                <CommandGroup heading="recent searches">
                  {recent.map((item) => (
                    <CommandItem key={item} value={`recent-${item}`} onSelect={() => setText(item)}>
                      <ClockIcon className="text-muted-foreground" />
                      <span className="truncate">{item}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {played.length > 0 && (
                <CommandGroup heading="recently played">
                  {played.map((song) => (
                    <CommandItem key={song.id} value={`played-${song.id}`} onSelect={run(() => player.play([song], 0))}>
                      <Row cover={song.coverArt} title={song.title} sub={`${song.artist ?? ""} · ${song.album ?? ""}`} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {top && (
                <CommandGroup heading="top result">
                  <CommandItem
                    value={`top-${top.item.id}`}
                    onSelect={run(() => openResult(top.kind, top.item, query))}
                    className="gap-3 py-2"
                  >
                    <Cover id={String(top.item.coverArt ?? "")} size={64} className="size-14 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-base">{resultTitle(top.kind, top.item)}</span>
                      <span className="truncate text-muted-foreground text-xs">{resultSubtitle(top.kind, top.item)}</span>
                    </span>
                    {/* A mouse shortcut only (options can't hold buttons); keyboard users get the "play" option below. */}
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center border text-muted-foreground hover:text-foreground"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        run(() => void playResult(top.kind, top.item, query))();
                      }}
                    >
                      <PlayIcon className="size-4" />
                    </span>
                  </CommandItem>
                  {top.kind !== "song" && (
                    <CommandItem value={`top-play-${top.item.id}`} onSelect={run(() => void playResult(top.kind, top.item, query))}>
                      <PlayIcon className="text-muted-foreground" />
                      <span className="truncate">play {resultTitle(top.kind, top.item)}</span>
                    </CommandItem>
                  )}
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
              {groups.map(([kind, all]) => {
                const items = all.filter((item) => !(top?.kind === kind && item.id === top.item.id));
                if (!items.length) return null;
                return (
                  <CommandGroup key={kind} heading={`${kind}s`}>
                    {items.map((item) => (
                      <CommandItem key={String(item.id)} value={`${kind}-${item.id}`} onSelect={run(() => openResult(kind, item, query))}>
                        <Row
                          cover={String(item.coverArt ?? "")}
                          title={resultTitle(kind, item)}
                          sub={resultSubtitle(kind, item).replace(/^\w+ · /, "")}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
              {playlists.length > 0 && (
                <CommandGroup heading="playlists">
                  {playlists.map((playlist) => (
                    <CommandItem key={playlist.id} value={`pl-${playlist.id}`} onSelect={run(() => go(`/playlist/${playlist.id}`))}>
                      <Row cover={playlist.coverArt} title={playlist.name} sub={`${playlist.songCount} songs`} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {lyricHits.length > 0 && (
                <CommandGroup heading="lyrics">
                  {lyricHits.map((hit) => {
                    const song = hit.song as unknown as Song;
                    return (
                      <CommandItem key={song.id} value={`ly-${song.id}`} onSelect={run(() => playLyricsHit(hit, lyricsWords))}>
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
              {!addFirst && addItem}
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
            </CommandList>
          </ListContextMenu>
          {needle && (
            <div className="flex items-center justify-between gap-3 border-t px-3 py-1.5 font-mono text-[11px] text-faint">
              <span>
                {lyrics && lyricsWanted && lyrics.checked < lyrics.total
                  ? `lyrics checked for ${lyrics.checked.toLocaleString()} / ${lyrics.total.toLocaleString()} songs so far`
                  : ""}
              </span>
              <Button variant="link" size="xs" className="h-auto gap-1.5 px-0 font-mono text-[11px] text-muted-foreground" onClick={seeAll}>
                see all results <KeyCombo binding="mod+enter" />
              </Button>
            </div>
          )}
        </Command>
      )}
    </CommandDialog>
  );
}
