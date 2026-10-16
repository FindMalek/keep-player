import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createPlaylist } from "@/lib/playlists";
import { go } from "@/lib/router";
import type { Song } from "@/lib/types";

/** ⌘N (and "new playlist" wherever you add songs): name it, "Folder / Name" files it in a folder. */
export function NewPlaylistDialog({
  open,
  onOpenChange,
  songs = [],
  folder = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songs?: Song[];
  folder?: string;
}) {
  const [name, setName] = useState(folder ? `${folder} / ` : "");
  // Keyed by the host on what was asked, so a "new playlist in here" starts from that folder.
  const [comment, setComment] = useState("");
  const [isPublic, setPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  async function save(): Promise<void> {
    const trimmed = name.trim().replace(/\s*\/\s*/g, " / ");
    if (!trimmed || saving) return;
    setSaving(true);
    const id = await createPlaylist(trimmed, { comment: comment.trim(), isPublic, songs });
    setSaving(false);
    if (!id) return;
    onOpenChange(false);
    go(`/playlist/${id}`);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">new playlist</DialogTitle>
          <DialogDescription>
            {songs.length ? `with ${songs.length === 1 ? songs[0]?.title : `${songs.length} songs`}. ` : ""}“folder / name” puts it in a
            folder.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="playlist-name">name</Label>
            <Input id="playlist-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="playlist-description">description</Label>
            <Textarea id="playlist-description" rows={2} value={comment} onChange={(event) => setComment(event.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="playlist-public" checked={isPublic} onCheckedChange={setPublic} />
            <Label htmlFor="playlist-public">public · others on this server can see it</Label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || saving}>
              create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
