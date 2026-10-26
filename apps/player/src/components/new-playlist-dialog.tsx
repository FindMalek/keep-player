import { Button } from "@keep/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@keep/ui/components/dialog";
import { Input } from "@keep/ui/components/input";
import { Label } from "@keep/ui/components/label";
import { Switch } from "@keep/ui/components/switch";
import { Textarea } from "@keep/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { SparklesIcon } from "lucide-react";
import { useState } from "react";
import { apiQueries } from "@/lib/api-queries";
import { createPlaylist } from "@/lib/playlists";
import { go } from "@/lib/router";
import { HEADERS } from "@/lib/subsonic";
import type { Song } from "@/lib/types";

interface Made {
  name: string;
  description: string;
  artists: string[];
  songs: Song[];
}

/**
 * ⌘N (and "new playlist" wherever you add songs): name it, "Folder / Name" files it in a folder. With Groq on the server,
 * an empty one can also be described ("rainy sunday, slow, warm") and filled from your own songs.
 */
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
  const canDescribe = useQuery(apiQueries.session()).data?.ai === true && songs.length === 0;
  const [prompt, setPrompt] = useState("");
  const [made, setMade] = useState<Made | null>(null);
  const [making, setMaking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function make(): Promise<void> {
    if (!prompt.trim() || making) return;
    setMaking(true);
    setProblem(null);
    const response = await fetch("/api/ai/playlist", {
      method: "POST",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as (Made & { error?: string }) | null;
    setMaking(false);
    if (!response?.ok || !body?.songs?.length) {
      setProblem(body?.error ?? "couldn't make that one");
      return;
    }
    setMade(body);
    setName(`${folder ? `${folder} / ` : ""}${body.name}`);
    setComment(body.description);
  }

  async function save(): Promise<void> {
    const trimmed = name.trim().replace(/\s*\/\s*/g, " / ");
    if (!trimmed || saving) return;
    setSaving(true);
    const id = await createPlaylist(trimmed, { comment: comment.trim(), isPublic, songs: made?.songs ?? songs });
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
            {made
              ? `with ${made.songs.length} songs. `
              : songs.length
                ? `with ${songs.length === 1 ? songs[0]?.title : `${songs.length} songs`}. `
                : ""}
            “folder / name” puts it in a folder.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {canDescribe && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="playlist-prompt">describe it</Label>
              <div className="flex gap-2">
                <Input
                  id="playlist-prompt"
                  placeholder="rainy sunday, slow, warm, no vocals"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    void make();
                  }}
                />
                <Button type="button" variant="outline" disabled={!prompt.trim() || making} onClick={() => void make()}>
                  <SparklesIcon />
                  {making ? "making…" : made ? "again" : "make it"}
                </Button>
              </div>
              {problem ? (
                <p className="text-destructive text-xs">{problem}</p>
              ) : made ? (
                <p className="text-muted-foreground text-xs">
                  {made.songs.length} of your songs · {made.artists.slice(0, 4).join(", ")}
                  {made.artists.length > 4 ? ` and ${made.artists.length - 4} more` : ""}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">only songs you own · picked by groq from your artists</p>
              )}
            </div>
          )}
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
