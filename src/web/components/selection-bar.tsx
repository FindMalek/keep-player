import { useQuery } from "@tanstack/react-query";
import { ListEndIcon, ListMusicIcon, ListStartIcon, PlayIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notify } from "@/lib/notify";
import { player } from "@/lib/player";
import { queries, queryClient } from "@/lib/queries";
import { api } from "@/lib/subsonic";
import type { Song } from "@/lib/types";
import { Hint } from "./hint";

async function addToPlaylist(playlistId: string, name: string, songs: Song[]): Promise<void> {
  try {
    await api("updatePlaylist", { playlistId, songIdToAdd: songs.map((song) => song.id) });
    await queryClient.invalidateQueries({ queryKey: queries.playlist(playlistId).queryKey });
    await queryClient.invalidateQueries({ queryKey: queries.playlists().queryKey });
    notify({ message: `added ${songs.length === 1 ? "1 song" : `${songs.length} songs`} to ${name}` });
  } catch {
    notify({ kind: "error", message: `couldn't add to ${name}` });
  }
}

/** Floats above the player bar while rows are selected: what you can do with all of them at once. */
export function SelectionBar({ songs, onPlay, onClear }: { songs: Song[]; onPlay: () => void; onClear: () => void }) {
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
            {(playlists.data ?? []).map((playlist) => (
              <DropdownMenuItem key={playlist.id} onClick={() => void addToPlaylist(playlist.id, playlist.name, songs)}>
                {playlist.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Hint label="clear selection" shortcut="list-clear">
        <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="clear selection">
          <XIcon />
        </Button>
      </Hint>
    </div>
  );
}
