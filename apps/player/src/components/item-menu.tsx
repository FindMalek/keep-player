import { Button } from "@keep/ui/components/button";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@keep/ui/components/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@keep/ui/components/dropdown-menu";
import { Input } from "@keep/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import {
  BanIcon,
  DiscIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  HeartIcon,
  HeartOffIcon,
  ImageDownIcon,
  LinkIcon,
  ListEndIcon,
  ListMusicIcon,
  ListStartIcon,
  MoreHorizontalIcon,
  PlayIcon,
  PlusIcon,
  RadioIcon,
  ScissorsIcon,
  ShuffleIcon,
  UserIcon,
} from "lucide-react";
import { cloneElement, type MouseEvent, type ReactElement, useRef, useState } from "react";
import { clock } from "@/lib/format";
import { isLiked, type LikeKind, setLiked } from "@/lib/likes";
import { notify } from "@/lib/notify";
import { player } from "@/lib/player";
import { openPlaylistDialog } from "@/lib/playlist-dialogs";
import { addToPlaylist, canEdit, leafOf } from "@/lib/playlists";
import { albumPref, songPref, usePrefsVersion } from "@/lib/prefs";
import { queries } from "@/lib/queries";
import { go } from "@/lib/router";
import { type MenuTarget, songsOf, sourceOf } from "@/lib/targets";

export type { MenuTarget };

// One action list per kind of item, shown as a right-click menu (`ItemContextMenu`) and a "⋯" button
// (`ItemMoreButton`). Base UI's context menu and dropdown share item parts, so both render `ItemActions`.

function linkOf(target: MenuTarget): string | null {
  if (target.kind === "album") return `/album/${target.album.id}`;
  if (target.kind === "artist") return `/artist/${target.artist.id}`;
  if (target.kind === "playlist") return `/playlist/${target.playlist.id}`;
  const song = target.songs.length === 1 ? target.songs[0] : undefined;
  return song?.albumId ? `/album/${song.albumId}` : null;
}

function likeOf(target: MenuTarget): { kind: LikeKind; id: string; label: string } | null {
  if (target.kind === "album") return { kind: "album", id: target.album.id, label: target.album.name };
  if (target.kind === "artist") return { kind: "artist", id: target.artist.id, label: target.artist.name };
  const song = target.kind === "songs" && target.songs.length === 1 ? target.songs[0] : undefined;
  return song ? { kind: "song", id: song.id, label: song.title } : null;
}

const run = (action: () => Promise<unknown> | unknown) => () => {
  void Promise.resolve()
    .then(action)
    .catch(() => notify({ kind: "error", message: "that didn't work, try again" }));
};

export function ItemActions({ target }: { target: MenuTarget }) {
  const source = sourceOf(target);
  const link = linkOf(target);
  const like = likeOf(target);
  const liked = like ? isLiked(like.id) : false;
  const song = target.kind === "songs" && target.songs.length === 1 ? target.songs[0] : undefined;
  const count = target.kind === "songs" && target.songs.length > 1 ? `${target.songs.length} songs` : null;
  const album = target.kind === "album";
  usePrefsVersion();
  const pref = song ? songPref(song.id) : undefined;
  const albumRules = target.kind === "album" ? albumPref(target.album.id) : undefined;
  const edit =
    <T,>(run: (module: typeof import("@/lib/prefs-edit")) => T) =>
    () =>
      void import("@/lib/prefs-edit").then(run);
  const playing = song && player.getState().queue.current?.song.id === song.id;
  const at = Math.round(player.getPosition() * 10) / 10;

  return (
    <>
      {count && (
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-mono text-label text-faint">{count}</DropdownMenuLabel>
        </DropdownMenuGroup>
      )}
      <DropdownMenuItem onClick={run(async () => player.play(await songsOf(target), 0, { album, source }))}>
        <PlayIcon /> play
      </DropdownMenuItem>
      {target.kind !== "songs" && (
        <DropdownMenuItem onClick={run(async () => player.play(await songsOf(target), -1, { shuffle: true, source }))}>
          <ShuffleIcon /> shuffle
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={run(async () => player.playNext(await songsOf(target)))}>
        <ListStartIcon /> play next
      </DropdownMenuItem>
      <DropdownMenuItem onClick={run(async () => player.addToQueue(await songsOf(target)))}>
        <ListEndIcon /> add to queue
      </DropdownMenuItem>
      <AddToPlaylist target={target} />
      <DropdownMenuItem onClick={run(() => import("@/lib/radio").then((radio) => radio.startRadio(target)))}>
        <RadioIcon /> start radio
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {like && (
        <DropdownMenuItem onClick={run(() => setLiked(like.kind, like.id, !liked, like.label))}>
          {liked ? <HeartOffIcon /> : <HeartIcon />} {liked ? "unlike" : "like"}
        </DropdownMenuItem>
      )}
      {target.kind === "playlist" && (
        <DropdownMenuItem
          onClick={run(async () => {
            const [{ exportAura }, songs] = await Promise.all([import("@/components/aura"), songsOf(target)]);
            exportAura(target.playlist.id, songs, leafOf(target.playlist.name));
          })}
        >
          <ImageDownIcon /> save aura as png
        </DropdownMenuItem>
      )}
      {song && (
        <>
          <DropdownMenuSeparator />
          {playing && at >= 1 && (
            <>
              <DropdownMenuItem onClick={edit((m) => m.trimHere("start"))}>
                <ScissorsIcon /> start here at {clock(at)}
                <DropdownMenuShortcut>⌥[</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={edit((m) => m.trimHere("end"))}>
                <ScissorsIcon /> end here at {clock(at)}
                <DropdownMenuShortcut>⌥]</DropdownMenuShortcut>
              </DropdownMenuItem>
            </>
          )}
          {(pref?.trimStart != null || pref?.trimEnd != null) && (
            <DropdownMenuItem onClick={edit((m) => m.clearTrim(song))}>
              <ScissorsIcon /> clear trim ({clock(pref.trimStart ?? 0)} – {pref.trimEnd != null ? clock(pref.trimEnd) : "end"})
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={edit((m) =>
              m.changeSong(
                song,
                { never: !pref?.never },
                pref?.never ? `${song.title} can come up in shuffle and radio again` : `${song.title} never comes up in shuffle or radio`,
              ),
            )}
          >
            <BanIcon /> {pref?.never ? "allow in shuffle and radio" : "never in shuffle or radio"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={edit((m) =>
              m.changeSong(
                song,
                { hidden: !pref?.hidden },
                pref?.hidden ? `${song.title} is back everywhere` : `${song.title} now shows only on its album`,
              ),
            )}
          >
            {pref?.hidden ? <EyeIcon /> : <EyeOffIcon />} {pref?.hidden ? "unhide song" : "hide song"}
          </DropdownMenuItem>
        </>
      )}
      {target.kind === "album" && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={edit((m) =>
              m.changeAlbum(
                target.album,
                { keepOrder: !albumRules?.keepOrder },
                albumRules?.keepOrder
                  ? `${target.album.name} shuffles song by song again`
                  : `${target.album.name} stays in order when shuffled`,
              ),
            )}
          >
            <ListMusicIcon /> {albumRules?.keepOrder ? "shuffle song by song" : "keep in order when shuffled"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={edit((m) =>
              m.changeAlbum(
                target.album,
                { never: !albumRules?.never },
                albumRules?.never
                  ? `${target.album.name} can come up in shuffle and radio again`
                  : `${target.album.name} never comes up in shuffle or radio`,
              ),
            )}
          >
            <BanIcon /> {albumRules?.never ? "allow in shuffle and radio" : "never in shuffle or radio"}
          </DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
      {song?.albumId && (
        <DropdownMenuItem onClick={() => go(`/album/${song.albumId}`)}>
          <DiscIcon /> go to album
        </DropdownMenuItem>
      )}
      {(song?.artistId || (target.kind === "album" && target.album.artistId)) && (
        <DropdownMenuItem onClick={() => go(`/artist/${song?.artistId ?? (target.kind === "album" ? target.album.artistId : "")}`)}>
          <UserIcon /> go to artist
        </DropdownMenuItem>
      )}
      {song?.parent && (
        <DropdownMenuItem onClick={() => go(`/folders/${encodeURIComponent(song.parent ?? "")}`)}>
          <FolderIcon /> show in folder
        </DropdownMenuItem>
      )}
      {link && (
        <DropdownMenuItem
          onClick={run(async () => {
            await navigator.clipboard.writeText(new URL(link, window.location.origin).toString());
            notify({ message: "link copied" });
          })}
        >
          <LinkIcon /> copy link
        </DropdownMenuItem>
      )}
      {song && player.getState().queue.current?.song.id === song.id && player.getPosition() >= 1 && (
        <DropdownMenuItem onClick={run(() => import("@/lib/moments").then((moments) => moments.copyCurrentLink()))}>
          <LinkIcon /> copy link at {clock(player.getPosition())}
          <DropdownMenuShortcut>⇧C</DropdownMenuShortcut>
        </DropdownMenuItem>
      )}
      {(song || target.kind === "album") && (
        <DropdownMenuItem
          render={
            <a href={`/rest/download?id=${encodeURIComponent(song?.id ?? (target.kind === "album" ? target.album.id : ""))}`} download />
          }
        >
          <DownloadIcon /> download{target.kind === "album" ? " (zip)" : ""}
        </DropdownMenuItem>
      )}
    </>
  );
}

function AddToPlaylist({ target }: { target: MenuTarget }) {
  const playlists = useQuery(queries.playlists());
  const [filter, setFilter] = useState("");
  const editable = (playlists.data ?? [])
    .filter(canEdit)
    .filter((playlist) => target.kind !== "playlist" || playlist.id !== target.playlist.id)
    .filter((playlist) => playlist.name.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ListMusicIcon /> add to playlist
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 min-w-56">
        <div className="p-1">
          <Input
            aria-label="find a playlist"
            placeholder="find a playlist"
            className="h-7 text-xs"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            // Typing goes to the box, not to the menu's type-ahead.
            onKeyDown={(event) => event.key !== "Escape" && event.key !== "ArrowDown" && event.stopPropagation()}
          />
        </div>
        <DropdownMenuItem onClick={run(async () => openPlaylistDialog({ kind: "new", songs: await songsOf(target) }))}>
          <PlusIcon /> new playlist…
        </DropdownMenuItem>
        {editable.map((playlist) => (
          <DropdownMenuItem key={playlist.id} onClick={run(async () => addToPlaylist(playlist, await songsOf(target)))}>
            {playlist.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

// One right-click menu per list or grid: `resolve` maps the clicked (or focused, for ⇧F10) element to what
// the menu acts on, so rows carry no menu of their own.
export function ListContextMenu({
  resolve,
  children,
}: {
  resolve: (element: Element) => MenuTarget | null;
  children: ReactElement<{ onContextMenuCapture?: (event: MouseEvent<Element>) => void }>;
}) {
  const [target, setTarget] = useState<MenuTarget | null>(null);
  // The capture handler runs just before the menu asks to open, in the same event: read the target from here.
  const latest = useRef<MenuTarget | null>(null);
  const [open, setOpen] = useState(false);
  const capture = (event: MouseEvent<Element>) => {
    const found = event.target instanceof Element ? resolve(event.target) : null;
    latest.current = found;
    setTarget(found);
    // Nothing under the pointer: leave the browser's own menu alone.
    if (!found) event.stopPropagation();
  };
  return (
    <ContextMenu open={open && !!target} onOpenChange={(next) => setOpen(next && !!latest.current)}>
      <ContextMenuTrigger render={cloneElement(children, { onContextMenuCapture: capture })} />
      {open && target && (
        <ContextMenuContent>
          <ItemActions target={target} />
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}

export function ItemMoreButton({ target, label, className }: { target: MenuTarget; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`more for ${label}`} className={className} />}>
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      {open && (
        <DropdownMenuContent align="end" className="min-w-48">
          <ItemActions target={target} />
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}

// For first-screen places (the sidebar) that keep menu code off it: they catch the right-click, lazy-load
// this, and show it where the pointer was.
export function PointMenu({ target, x, y, onClose }: { target: MenuTarget; x: number; y: number; onClose: () => void }) {
  return (
    <DropdownMenu open onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger render={<span aria-hidden className="pointer-events-none fixed size-0" style={{ left: x, top: y }} />} />
      <DropdownMenuContent className="min-w-48">
        <ItemActions target={target} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
