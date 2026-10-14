import { ListMusicIcon, PlayIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clock } from "@/lib/format";
import { currentSong, player, usePlayer } from "@/lib/player";
import { api } from "@/lib/subsonic";
import type { Album, Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Cover } from "./cover";
import { Equalizer } from "./equalizer";
import { Link } from "./link";

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

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-5 pt-3.5 pb-1.5">
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

export function AlbumGrid({ albums }: { albums: Album[] }) {
  if (!albums.length) return <EmptyState>no albums</EmptyState>;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-x-3 gap-y-4">
      {albums.map((album) => (
        <li key={album.id} className="group/album relative min-w-0">
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
        </li>
      ))}
    </ul>
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

export function TrackList({ songs, showAlbum = true, showArtist = true, numbered = "index", asAlbum = false }: TrackListProps) {
  const state = usePlayer();
  const playingId = currentSong(state)?.id;
  if (!songs.length) return <EmptyState>no tracks</EmptyState>;

  const multiDisc = new Set(songs.map((song) => song.discNumber ?? 1)).size > 1;
  let lastDisc: number | undefined;
  const play = (index: number) => player.play(songs, index, { album: asAlbum });

  return (
    <Table className="table-fixed text-[13px]" aria-label="tracks">
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
        {songs.flatMap((song, index) => {
          const disc = song.discNumber ?? 1;
          const rows: ReactNode[] = [];
          if (asAlbum && multiDisc && disc !== lastDisc)
            rows.push(
              <TableRow key={`disc-${disc}`} className="border-0 hover:bg-transparent">
                <TableCell colSpan={5} className={cn(LABEL, "px-2 pt-3 pb-1")}>
                  disc {disc}
                </TableCell>
              </TableRow>,
            );
          lastDisc = disc;
          const playing = song.id === playingId;
          rows.push(
            <TableRow
              // A song can appear twice in a playlist, so position is part of the key.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              key={`${song.id}-${index}`}
              tabIndex={0}
              data-playing={playing || undefined}
              className="group/row h-[34px] border-muted outline-none focus-visible:bg-card focus-visible:shadow-[inset_2px_0_0_var(--foreground)] hover:bg-card"
              onDoubleClick={() => play(index)}
              onKeyDown={(event) => event.key === "Enter" && event.target === event.currentTarget && play(index)}
            >
              <TableCell className="relative py-0 font-mono text-muted-foreground tabular-nums">
                <span className="group-hover/row:invisible">
                  {playing ? <Equalizer playing={state.playing} /> : numbered === "track" ? (song.track ?? index + 1) : index + 1}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="invisible absolute top-1/2 left-1 -translate-y-1/2 group-hover/row:visible focus-visible:visible"
                  onClick={() => play(index)}
                  aria-label={`play ${song.title}`}
                >
                  <PlayIcon className="fill-current" />
                </Button>
              </TableCell>
              <TableCell className="py-0">
                <div className="flex min-w-0 flex-col">
                  <span className={cn("truncate", playing && "font-medium")}>{song.title}</span>
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
                    <ListMusicIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => player.addToQueue([song])}
                    aria-label={`add ${song.title} to queue`}
                  >
                    <PlusIcon />
                  </Button>
                </div>
              </TableCell>
            </TableRow>,
          );
          return rows;
        })}
      </TableBody>
    </Table>
  );
}
