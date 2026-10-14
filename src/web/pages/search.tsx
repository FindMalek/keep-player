import { useQuery } from "@tanstack/react-query";
import { PlayIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Cover } from "@/components/cover";
import { AlbumGrid, Content, EmptyState, PageHeader, Section, TrackList } from "@/components/library";
import { Link } from "@/components/link";
import { LyricsSnippet } from "@/components/lyrics-snippet";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { apiQueries } from "@/lib/api-queries";
import { useSearchParam } from "@/lib/router";
import { openResult, playLyricsHit, playResult, rememberSearch, resultSubtitle, resultTitle } from "@/lib/search-actions";
import type { Album, Artist, Song } from "@/lib/types";
import { parseQuery } from "../../shared/search-query";

const LIMIT = 50;

/** `/search?q=`: the palette's results, larger: top result, songs, albums, artists and lyrics. */
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

  return (
    <>
      <PageHeader title="search" />
      <Content>
        <InputGroup className="mb-6 h-10 max-w-xl">
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
        {nothing && <EmptyState>nothing matches “{query}”</EmptyState>}
        {top && (
          <Section title="top result">
            <div className="flex max-w-xl items-center gap-4 border p-3">
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
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6">
              {artists.map((artist) => (
                <li key={artist.id}>
                  <Link href={`/artist/${artist.id}`} className="flex h-8 items-center justify-between gap-3 px-1.5 hover:bg-card">
                    <span className="truncate">{artist.name}</span>
                    <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">{artist.albumCount ?? 0}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {hits.length > 0 && (
          <Section title="lyrics">
            <ul className="flex max-w-2xl flex-col">
              {hits.map((hit) => {
                const song = hit.song as unknown as Song;
                return (
                  <li key={song.id}>
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
          </Section>
        )}
      </Content>
    </>
  );
}
