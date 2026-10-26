import { parseQuery } from "@keep/shared/search-query";
import { Button } from "@keep/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@keep/ui/components/input-group";
import { useQuery } from "@tanstack/react-query";
import { PlayIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Cover } from "@/components/cover";
import { ListContextMenu, type MenuTarget } from "@/components/item-menu";
import { AlbumGrid, Content, EmptyState, Section, TrackList } from "@/components/library";
import { Link } from "@/components/link";
import { LyricsSnippet } from "@/components/lyrics-snippet";
import { TrackListSkeleton } from "@/components/skeletons";
import { apiQueries } from "@/lib/api-queries";
import { useSearchParam } from "@/lib/router";
import { openResult, playLyricsHit, playResult, rememberSearch, resultSubtitle, resultTarget, resultTitle } from "@/lib/search-actions";
import type { Album, Artist, Song } from "@/lib/types";

const LIMIT = 50;

export function SearchPage() {
  const initial = useSearchParam("q");
  const [text, setText] = useState(initial);
  const [query, setQuery] = useState(initial.trim());
  // A new search from the palette while this page is open.
  useEffect(() => setText(initial), [initial]);
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(text.trim());
      // Keep the address shareable without a history entry per keystroke.
      window.history.replaceState(window.history.state, "", `/search?${new URLSearchParams({ q: text.trim() })}`);
    }, 120);
    return () => clearTimeout(id);
  }, [text]);
  useEffect(() => rememberSearch(query), [query]);
  const parsed = parseQuery(query);

  const { data, isPending } = useQuery({
    ...apiQueries.search(query, LIMIT),
    enabled: query.length > 0 && !parsed.lyricsOnly,
    placeholderData: (previous) => previous,
  });
  const lyricsWanted = parsed.text.length >= 3 && (parsed.lyricsOnly || !parsed.chips.length);
  const lyrics = useQuery({ ...apiQueries.lyricsSearch(parsed.text), enabled: lyricsWanted }).data;
  const top = query && !parsed.lyricsOnly ? data?.top : null;
  const songs = (query && !parsed.lyricsOnly ? (data?.songs ?? []) : []) as unknown as Song[];
  const albums = (query && !parsed.lyricsOnly ? (data?.albums ?? []) : []) as unknown as Album[];
  const artists = (query && !parsed.lyricsOnly ? (data?.artists ?? []) : []) as unknown as Artist[];
  const hits = lyricsWanted ? (lyrics?.hits ?? []) : [];
  const nothing = query && !isPending && !top && !songs.length && !albums.length && !artists.length && !hits.length;

  // Right-click on the top result, an artist or a lyrics hit (song rows and album cards bring their own menus).
  const targets = new Map<string, MenuTarget>();
  if (top) targets.set(`top-${top.item.id}`, resultTarget(top.kind, top.item));
  for (const artist of artists) targets.set(`artist-${artist.id}`, { kind: "artist", artist });
  for (const hit of hits)
    targets.set(`lyrics-${(hit.song as unknown as Song).id}`, { kind: "songs", songs: [hit.song as unknown as Song] });
  const menuTarget = (element: Element) => targets.get(element.closest("[data-menu]")?.getAttribute("data-menu") ?? "") ?? null;

  return (
    <>
      {/* The search box is the header, at the very top and still there while you scroll the results. */}
      <header className="sticky top-0 z-10 flex min-h-11 items-center gap-3.5 border-b bg-background px-5 py-1.5">
        <h1 className="sr-only">search</h1>
        <InputGroup className="h-8 max-w-xl">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            autoFocus
            aria-label="search"
            placeholder="search, or try artist: year:1990..1999 is:liked lyrics:"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="font-mono"
          />
        </InputGroup>
      </header>
      <Content>
        {nothing && <EmptyState>nothing matches “{query}”</EmptyState>}
        {query && !parsed.lyricsOnly && isPending && <TrackListSkeleton count={10} />}
        {top && (
          <Section title="top result">
            <ListContextMenu resolve={menuTarget}>
              <div data-menu={`top-${top.item.id}`} className="flex max-w-xl items-center gap-4 border p-3">
                <button type="button" className="shrink-0" onClick={() => openResult(top.kind, top.item, query)}>
                  <Cover id={String(top.item.coverArt ?? "")} size={128} className="size-24" />
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <button
                    type="button"
                    className="truncate text-left font-medium text-xl hover:underline"
                    onClick={() => openResult(top.kind, top.item, query)}
                  >
                    {resultTitle(top.kind, top.item)}
                  </button>
                  <span className="truncate text-muted-foreground text-sm">{resultSubtitle(top.kind, top.item)}</span>
                </div>
                <Button aria-label={`play ${resultTitle(top.kind, top.item)}`} onClick={() => void playResult(top.kind, top.item, query)}>
                  <PlayIcon /> play
                </Button>
              </div>
            </ListContextMenu>
          </Section>
        )}
        {songs.length > 0 && (
          <Section title="songs">
            <TrackList songs={songs} source={{ kind: "search", name: `“${query}”` }} />
          </Section>
        )}
        {albums.length > 0 && (
          <Section title="albums">
            <AlbumGrid albums={albums} />
          </Section>
        )}
        {artists.length > 0 && (
          <Section title="artists">
            <ListContextMenu resolve={menuTarget}>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6">
                {artists.map((artist) => (
                  <li key={artist.id} data-menu={`artist-${artist.id}`}>
                    <Link href={`/artist/${artist.id}`} className="flex h-8 items-center justify-between gap-3 px-1.5 hover:bg-card">
                      <span className="truncate">{artist.name}</span>
                      <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">{artist.albumCount ?? 0}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </ListContextMenu>
          </Section>
        )}
        {hits.length > 0 && (
          <Section title="lyrics">
            <ListContextMenu resolve={menuTarget}>
              <ul className="flex max-w-2xl flex-col">
                {hits.map((hit) => {
                  const song = hit.song as unknown as Song;
                  return (
                    <li key={song.id} data-menu={`lyrics-${song.id}`}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 px-1.5 py-2 text-left hover:bg-card"
                        onClick={() => playLyricsHit(hit, parsed.text)}
                      >
                        <Cover id={song.coverArt} size={48} className="size-10 shrink-0" />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-sm">
                            {song.title}
                            <span className="text-muted-foreground"> · {song.artist}</span>
                          </span>
                          <LyricsSnippet hit={hit} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ListContextMenu>
          </Section>
        )}
      </Content>
    </>
  );
}
