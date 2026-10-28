import { Button } from "@lodesong/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@lodesong/ui/components/dialog";
import { Input } from "@lodesong/ui/components/input";
import { Label } from "@lodesong/ui/components/label";
import { useState } from "react";
import { openPlaylistDialog, type PlaylistDialog } from "@/lib/playlist-dialogs";
import { renameFolder } from "@/lib/playlists";
import { NewPlaylistDialog } from "./new-playlist-dialog";

/** A folder is the "Folder / " part of playlist names: renaming it renames every playlist inside. */
function FolderDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const [name, setName] = useState(path);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">folder · {path}</DialogTitle>
          <DialogDescription>renaming it renames the playlists inside; “a / b” nests it.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const next = name.trim().replace(/\s*\/\s*/g, " / ");
            if (!next || next === path) return onClose();
            setSaving(true);
            void renameFolder(path, next).finally(onClose);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="folder-name">name</Label>
            <Input id="folder-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => openPlaylistDialog({ kind: "new", folder: path })}>
              new playlist in here
            </Button>
            <Button type="submit" disabled={saving}>
              rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlaylistDialogs({ dialog }: { dialog: NonNullable<PlaylistDialog> }) {
  const close = () => openPlaylistDialog(null);
  if (dialog.kind === "folder") return <FolderDialog path={dialog.path} onClose={close} />;
  return <NewPlaylistDialog open onOpenChange={(next) => !next && close()} songs={dialog.songs} folder={dialog.folder} />;
}
