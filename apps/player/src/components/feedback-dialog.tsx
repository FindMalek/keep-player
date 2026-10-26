import { Button } from "@keep/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@keep/ui/components/dialog";
import { Textarea } from "@keep/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@keep/ui/components/toggle-group";
import { ImageIcon, XIcon } from "lucide-react";
import { type ClipboardEvent, useRef, useState } from "react";
import { notify } from "@/lib/notify";
import { HEADERS } from "@/lib/subsonic";

type Kind = "bug" | "idea";
type Shot = { data: string; type: "image/png" | "image/jpeg"; url: string };

const MAX_BYTES = 5 * 1024 * 1024;

async function readShot(file: File): Promise<Shot | null> {
  if ((file.type !== "image/png" && file.type !== "image/jpeg") || file.size > MAX_BYTES) return null;
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return { data: btoa(binary), type: file.type, url: URL.createObjectURL(file) };
}

/** Send feedback (user menu): a bug or an idea, with a screenshot if you like, filed as a GitHub issue by the server. */
export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [kind, setKind] = useState<Kind>("bug");
  const [text, setText] = useState("");
  const [shot, setShot] = useState<Shot | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function attach(file: File | undefined): Promise<void> {
    if (!file) return;
    const read = await readShot(file);
    if (!read) setProblem("a png or jpeg under 5 MB");
    else {
      setProblem(null);
      setShot(read);
    }
  }

  async function send(): Promise<void> {
    if (!text.trim() || sending) return;
    setSending(true);
    setProblem(null);
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ kind, text, page: location.pathname, ...(shot ? { screenshot: { data: shot.data, type: shot.type } } : {}) }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { url?: string; error?: string } | null;
    setSending(false);
    if (!response?.ok || !body?.url) {
      setProblem(body?.error ?? "couldn't send it");
      return;
    }
    const url = body.url;
    notify({ message: "thanks, it's filed", action: { label: "open", onClick: () => window.open(url, "_blank", "noopener") } });
    setText("");
    setShot(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPaste={(event: ClipboardEvent) => void attach([...event.clipboardData.files].find((file) => file.type.startsWith("image/")))}
      >
        <DialogHeader>
          <DialogTitle className="font-mono">send feedback</DialogTitle>
          <DialogDescription>it becomes an issue on github. paste a screenshot (⌘V) or pick one.</DialogDescription>
        </DialogHeader>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="kind"
          value={[kind]}
          onValueChange={(value: string[]) => value[0] && setKind(value[0] as Kind)}
        >
          <ToggleGroupItem value="bug" className="font-mono font-normal">
            something's wrong
          </ToggleGroupItem>
          <ToggleGroupItem value="idea" className="font-mono font-normal">
            an idea
          </ToggleGroupItem>
        </ToggleGroup>
        <Textarea
          aria-label="feedback"
          rows={5}
          autoFocus
          placeholder={kind === "bug" ? "what happened, and what you expected" : "what would make it better"}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="flex items-center gap-2">
          {shot ? (
            <div className="relative">
              <img src={shot.url} alt="screenshot to send" className="h-16 border object-cover" />
              <Button
                variant="secondary"
                size="icon-xs"
                aria-label="remove screenshot"
                className="absolute -top-2 -right-2"
                onClick={() => setShot(null)}
              >
                <XIcon />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => picker.current?.click()}>
              <ImageIcon />
              add a screenshot
            </Button>
          )}
          <input
            ref={picker}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            aria-label="pick a screenshot"
            onChange={(event) => {
              void attach(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        {problem && <p className="text-destructive text-xs">{problem}</p>}
        <DialogFooter>
          <Button disabled={!text.trim() || sending} onClick={() => void send()}>
            {sending ? "sending…" : "send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
