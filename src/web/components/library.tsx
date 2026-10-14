import { ListEndIcon, ListStartIcon, PlayIcon } from "lucide-react";
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clock } from "@/lib/format";
import { currentSong, player, usePlayer } from "@/lib/player";
import { api } from "@/lib/subsonic";
import type { Album, Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePageVirtualizer, VIRTUALIZE_FROM } from "@/lib/virtual";
import { Cover } from "./cover";
import { Equalizer } from "./equalizer";
import { Link } from "./link";
import { VirtualGrid } from "./virtual-grid";

export function PageHeader({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex min-h-11 items-center justify-between gap-4 border-b bg-background px-5">
      <div className="flex min-w-0 items-baseline gap-3.5">
        <h1 className="truncate font-medium font-mono text-sm">{title}</h1>
        {meta !== undefined && <span className="shrink-0 font-mono text-muted-foreground text-xs">{meta}</span>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

export function Section({
  title,
  action,
  deferred,
  children,
}: {
  title: string;
  action?: ReactNode;
  deferred?: boolean;
  children: ReactNode;
}) {
  return (
    // Below-the-fold sections skip layout and paint until scrolled near (`deferred`).
    <section className={cn("px-5 pt-3.5 pb-1.5", deferred && "[contain-intrinsic-size:auto_420px] [content-visibility:auto]")}>
      <header className="mb-2.5 flex items-baseline justify-between">
        <h2 className="font-mono text-muted-foreground text-xs">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Content({ children }: { children: ReactNode }) {
  return <div className="px-5 pt-3.5 pb-8">{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Empty className="items-start p-0 py-6 text-left">
      <EmptyDescription className="font-mono text-faint text-xs">{children}</EmptyDescription>
    </Empty>
  );
}

export async function playAlbum(id: string, shuffle = false): Promise<void> {
  const { album } = await api<{ album: Album }>("getAlbum", { id });
  player.play(album.song ?? [], 0, { album: true, shuffle });
}

const AlbumCard = memo(function AlbumCard({ album }: { album: Album }) {
  return (
    <div className="group/album relative">
      <Link href={`/album/${album.id}`} className="flex flex-col gap-px">
        <Cover id={album.coverArt} size={180} className="mb-1.5 group-hover/album:[&_img]:opacity-85" />
        <span className="truncate text-[12.5px]">{album.name}</span>
        <span className="truncate text-[11.5px] text-muted-foreground">
          {album.artist}
          {album.year ? ` · ${album.year}` : ""}
        </span>
      </Link>
      {/* A square layer over the cover, so the button sits on the cover's corner whatever the card width. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex aspect-square items-end justify-end p-1.5">
        <Button
          size="icon"
          className="pointer-events-auto translate-y-1 opacity-0 transition group-hover/album:translate-y-0 group-hover/album:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
          onClick={() => void playAlbum(album.id)}
          aria-label={`play ${album.name}`}
        >
          <PlayIcon className="fill-current" />
        </Button>
      </div>
    </div>
  );
});

/** Cover (as wide as the column) plus two lines of text. */
const albumCardHeight = (width: number) => width + 6 + 18 + 16;

export function AlbumGrid({ albums, onNearEnd }: { albums: Album[]; onNearEnd?: () => void }) {
  if (!albums.length) return <EmptyState>no albums</EmptyState>;
  return (
    <VirtualGrid
      items={albums}
      getKey={(album) => album.id}
      renderItem={(album) => <AlbumCard album={album} />}
      min={136}
      gap={12}
      rowGap={16}
      estimateRow={albumCardHeight}
      onNearEnd={onNearEnd}
    />
  );
}

interface TrackListProps {
  songs: Song[];
  /** Album pages hide album and artist columns when they are all the same. */
  showAlbum?: boolean;
  showArtist?: boolean;
  numbered?: "track" | "index";
  /** Plays as an album (album ReplayGain) when true. */
  asAlbum?: boolean;
}

const LABEL = "font-mono font-normal text-[10.5px] text-faint";
const SUBLINK = "truncate text-muted-foreground hover:text-foreground hover:underline underline-offset-3";

interface TrackRowProps {
  song: Song;
  index: number;
  number: number;
  /** "playing" / "paused" for the current song, null for every other row (so only that row re-renders). */
  status: "playing" | "paused" | null;
  showAlbum: boolean;
  showArtist: boolean;
  onPlay: (index: number) => void;
  /** Set when virtualized: lets the virtualizer measure the row. */
  measure?: (element: Element | null) => void;
  virtualIndex?: number;
}

const TrackRow = memo(function TrackRow({
  song,
  index,
  number,
  status,
  showAlbum,
  showArtist,
  onPlay,
  measure,
  virtualIndex,
}: TrackRowProps) {
  return (
    <TableRow
      ref={measure}
      data-index={virtualIndex}
      tabIndex={0}
      data-playing={status ? true : undefined}
      className="group/row h-[34px] border-muted outline-none hover:bg-card focus-visible:bg-card focus-visible:shadow-[inset_2px_0_0_var(--foreground)]"
      onDoubleClick={() => onPlay(index)}
      onKeyDown={(event) => event.key === "Enter" && event.target === event.currentTarget && onPlay(index)}
    >
      <TableCell className="relative py-0 font-mono text-muted-foreground tabular-nums">
        <span className="group-hover/row:invisible">{status ? <Equalizer playing={status === "playing"} /> : number}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="invisible absolute top-1/2 left-1 -translate-y-1/2 focus-visible:visible group-hover/row:visible"
          onClick={() => onPlay(index)}
          aria-label={`play ${song.title}`}
        >
          <PlayIcon className="fill-current" />
        </Button>
      </TableCell>
      <TableCell className="py-0">
        <div className="flex min-w-0 flex-col">
          <span className={cn("truncate", status && "font-medium")}>{song.title}</span>
          {showArtist && song.artistId && (
            <Link href={`/artist/${song.artistId}`} className={cn(SUBLINK, "text-xs")}>
              {song.artist}
            </Link>
          )}
        </div>
      </TableCell>
      {showAlbum && (
        <TableCell className="truncate py-0 max-lg:hidden">
          {song.albumId && (
            <Link href={`/album/${song.albumId}`} className={SUBLINK}>
              {song.album}
            </Link>
          )}
        </TableCell>
      )}
      <TableCell className="py-0 text-right font-mono text-muted-foreground tabular-nums">{clock(song.duration)}</TableCell>
      <TableCell className="py-0">
        <div className="flex justify-end opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
          <Button variant="ghost" size="icon-xs" onClick={() => player.playNext([song])} aria-label={`play ${song.title} next`}>
            <ListStartIcon />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => player.addToQueue([song])} aria-label={`add ${song.title} to queue`}>
            <ListEndIcon />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});
// Survives minification, so the render-count e2e test can find rows in React's fiber tree.
TrackRow.displayName = "TrackRow";

type TrackItem = { kind: "disc"; disc: number } | { kind: "song"; song: Song; index: number };

export function TrackList({
  songs,
  showAlbum = true,
  showArtist = true,
  numbered = "index",
  asAlbum = false,
  onNearEnd,
}: TrackListProps & { onNearEnd?: () => void }) {
  const playingId = usePlayer((state) => currentSong(state)?.id);
  const playing = usePlayer((state) => state.playing);
  const onPlay = useCallback((index: number) => player.play(songs, index, { album: asAlbum }), [songs, asAlbum]);
  const items = useMemo<TrackItem[]>(() => {
    const multiDisc = asAlbum && new Set(songs.map((song) => song.discNumber ?? 1)).size > 1;
    let lastDisc: number | undefined;
    return songs.flatMap((song, index) => {
      const disc = song.discNumber ?? 1;
      const header: TrackItem[] = multiDisc && disc !== lastDisc ? [{ kind: "disc", disc }] : [];
      lastDisc = disc;
      return [...header, { kind: "song", song, index }];
    });
  }, [songs, asAlbum]);
  const listRef = useRef<HTMLDivElement>(null);
  const virtual = items.length > VIRTUALIZE_FROM;
  const virtualizer = usePageVirtualizer(listRef, {
    count: items.length,
    estimateSize: (index) => (items[index]?.kind === "disc" ? 32 : 34),
    enabled: virtual,
  });
  const windowItems = virtualizer.getVirtualItems();
  const last = windowItems.at(-1)?.index ?? 0;
  useEffect(() => {
    // Ask for the next page when the reader is 80% of the way down what's loaded.
    if (virtual && onNearEnd && last >= items.length * 0.8) onNearEnd();
  }, [virtual, onNearEnd, last, items.length]);
  if (!songs.length) return <EmptyState>no tracks</EmptyState>;

  const shown = virtual
    ? windowItems.map((item) => ({ item: items[item.index] as TrackItem, virtualIndex: item.index }))
    : items.map((item) => ({ item, virtualIndex: undefined }));
  const top = virtual ? (windowItems[0]?.start ?? 0) - virtualizer.options.scrollMargin : 0;
  const bottom = virtual ? virtualizer.getTotalSize() - ((windowItems.at(-1)?.end ?? 0) - virtualizer.options.scrollMargin) : 0;
  const columns = showAlbum ? 5 : 4;

  return (
    <div ref={listRef}>
      <Table className="table-fixed text-[13px]" aria-label="tracks" aria-rowcount={virtual ? items.length + 1 : undefined}>
        <colgroup>
          <col className="w-10" />
          <col />
          {showAlbum && <col className="w-[38%] max-lg:hidden" />}
          <col className="w-14" />
          <col className="w-16" />
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(LABEL, "h-6")}>#</TableHead>
            <TableHead className={cn(LABEL, "h-6")}>title</TableHead>
            {showAlbum && <TableHead className={cn(LABEL, "h-6 max-lg:hidden")}>album</TableHead>}
            <TableHead className={cn(LABEL, "h-6 text-right")}>time</TableHead>
            <TableHead className="h-6" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {top > 0 && <tr aria-hidden style={{ height: top }} />}
          {shown.map(({ item, virtualIndex }) =>
            item.kind === "disc" ? (
              <TableRow
                key={`disc-${item.disc}`}
                ref={virtual ? virtualizer.measureElement : undefined}
                data-index={virtualIndex}
                className="border-0 hover:bg-transparent"
              >
                <TableCell colSpan={columns} className={cn(LABEL, "px-2 pt-3 pb-1")}>
                  disc {item.disc}
                </TableCell>
              </TableRow>
            ) : (
              <TrackRow
                // A song can appear twice in a playlist, so position is part of the key.
                key={`${item.song.id}-${item.index}`}
                song={item.song}
                index={item.index}
                number={numbered === "track" ? (item.song.track ?? item.index + 1) : item.index + 1}
                status={item.song.id === playingId ? (playing ? "playing" : "paused") : null}
                showAlbum={showAlbum}
                showArtist={showArtist}
                onPlay={onPlay}
                measure={virtual ? virtualizer.measureElement : undefined}
                virtualIndex={virtualIndex}
              />
            ),
          )}
          {bottom > 0 && <tr aria-hidden style={{ height: bottom }} />}
        </TableBody>
      </Table>
    </div>
  );
}
