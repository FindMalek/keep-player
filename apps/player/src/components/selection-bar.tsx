import { Button } from "@keep/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@keep/ui/components/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { ListEndIcon, ListMusicIcon, ListStartIcon, MinusIcon, PlayIcon, PlusIcon, XIcon } from "lucide-react";
import { player } from "@/lib/player";
import { openPlaylistDialog } from "@/lib/playlist-dialogs";
import { addToPlaylist, canEdit } from "@/lib/playlists";
import { queries } from "@/lib/queries";
import type { Song } from "@/lib/types";
import { Hint } from "./hint";

/** Floats above the player bar while rows are selected: what you can do with all of them at once. */
export function SelectionBar({
  songs,
  onPlay,
  onClear,
  onRemove,
}: {
  songs: Song[];
  onPlay: () => void;
  onClear: () => void;
  /** On a playlist you can edit: take them out of it. */
  onRemove?: () => void;
}) {
  const playlists = useQuery(queries.playlists());

  return (
    <div
      role="toolbar"
      aria-label="selection"
      className="fixed bottom-[calc(var(--bar-height)+12px)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 border bg-popover p-1 pl-3 shadow-md"
    >
      <span className="mr-2 font-mono text-xs">{songs.length} selected</span>
      <Hint label="play these" shortcut="list-play">
        <Button variant="ghost" size="sm" onClick={onPlay}>
          <PlayIcon /> play
        </Button>
      </Hint>
      <Hint label="play next" shortcut="list-play-next">
        <Button variant="ghost" size="sm" onClick={() => player.playNext(songs)}>
          <ListStartIcon /> next
        </Button>
      </Hint>
      <Hint label="add to queue" shortcut="list-queue">
        <Button variant="ghost" size="sm" onClick={() => player.addToQueue(songs)}>
          <ListEndIcon /> queue
        </Button>
      </Hint>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
          <ListMusicIcon /> add to playlist
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" className="max-h-80 min-w-52 overflow-y-auto">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-mono text-[10.5px] text-faint">add to</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => openPlaylistDialog({ kind: "new", songs })}>
              <PlusIcon /> new playlist…
            </DropdownMenuItem>
            {(playlists.data ?? []).filter(canEdit).map((playlist) => (
              <DropdownMenuItem key={playlist.id} onClick={() => void addToPlaylist(playlist, songs)}>
                {playlist.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {onRemove && (
        <Hint label="remove from this playlist" shortcut="list-remove">
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <MinusIcon /> remove
          </Button>
        </Hint>
      )}

      <Hint label="clear selection" shortcut="list-clear">
        <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="clear selection">
          <XIcon />
        </Button>
      </Hint>
    </div>
  );
}
