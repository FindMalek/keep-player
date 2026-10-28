import { Button } from "@lodesong/ui/components/button";
import { Progress } from "@lodesong/ui/components/progress";
import { useQuery } from "@tanstack/react-query";
import { UploadIcon } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { Content, EmptyState, PageHeader } from "@/components/library";
import { HEADERS } from "@/lib/subsonic";
import { cn } from "@/lib/utils";

interface Item {
  file: File;
  /** Where it goes in the inbox, folders kept: "Artist/Album/01 Song.flac". */
  path: string;
  state: "waiting" | "sending" | "done" | "failed";
  sent: number;
  error?: string;
}

/** One file per request with XHR, because fetch can't report upload progress. */
function send(item: Item, onProgress: (sent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", `/api/upload?${new URLSearchParams({ path: item.path })}`);
    for (const [name, value] of Object.entries(HEADERS)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      if (request.status < 300) return resolve();
      // A proxy's 413 or 502 is html: a throw here would leave the promise, and the whole queue, hanging.
      let error: string | undefined;
      try {
        error = (JSON.parse(request.responseText) as { error?: string }).error;
      } catch {}
      reject(new Error(error ?? `failed (${request.status})`));
    };
    request.onerror = () => reject(new Error("connection lost"));
    request.send(item.file);
  });
}

/** Folders dropped from Finder or Explorer come in as entries; walk them so the album folders survive. */
async function filesFrom(entry: FileSystemEntry, prefix = ""): Promise<Item[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return [{ file, path: `${prefix}${file.name}`, state: "waiting", sent: 0 }];
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  const nested = await Promise.all(children.map((child) => filesFrom(child, `${prefix}${entry.name}/`)));
  return nested.flat();
}

export function UploadPage() {
  const status = useQuery({
    queryKey: ["upload"],
    queryFn: async () => ((await fetch("/api/upload", { headers: HEADERS })).ok ? true : false),
  });
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const busy = useRef(false);
  const picker = useRef<HTMLInputElement>(null);

  const update = (path: string, change: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.path === path ? { ...item, ...change } : item)));

  const run = async (queue: Item[]) => {
    if (busy.current) return;
    busy.current = true;
    for (const item of queue) {
      update(item.path, { state: "sending" });
      try {
        await send(item, (sent) => update(item.path, { sent }));
        update(item.path, { state: "done", sent: item.file.size });
      } catch (error) {
        update(item.path, { state: "failed", error: (error as Error).message });
      }
    }
    busy.current = false;
  };

  const add = (added: Item[]) => {
    const fresh = added.filter((item) => !item.file.name.startsWith("."));
    setItems((current) => [...current, ...fresh]);
    void run(fresh);
  };

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const entries = [...event.dataTransfer.items].map((item) => item.webkitGetAsEntry()).filter((entry) => entry !== null);
    add((await Promise.all(entries.map((entry) => filesFrom(entry)))).flat());
  };

  if (status.data === false)
    return (
      <>
        <PageHeader title="upload" />
        <Content>
          <EmptyState>uploads are off on this server · an admin sets UPLOAD_DIR to turn them on</EmptyState>
        </Content>
      </>
    );

  const done = items.filter((item) => item.state === "done").length;
  return (
    <>
      <PageHeader title="upload" meta={items.length ? `${done} of ${items.length}` : undefined} />
      <Content>
        <button
          type="button"
          className={cn(
            "flex w-full max-w-2xl flex-col items-center gap-2 border border-dashed px-6 py-10 text-muted-foreground hover:bg-card",
            dragging && "border-foreground bg-card text-foreground",
          )}
          onClick={() => picker.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => void onDrop(event)}
        >
          <UploadIcon className="size-5" />
          <span className="text-sm">drop songs or album folders here, or click to pick files</span>
          <span className="font-mono text-xs">flac, mp3, m4a, ogg, opus, wav · covers and .lrc travel along</span>
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          aria-label="pick files"
          onChange={(event) => {
            add([...(event.target.files ?? [])].map((file) => ({ file, path: file.name, state: "waiting", sent: 0 })));
            event.target.value = "";
          }}
        />
        {items.length > 0 && (
          <ul aria-label="uploads" className="mt-6 flex max-w-2xl flex-col gap-2">
            {items.map((item) => (
              <li key={item.path} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{item.path}</span>
                  <span
                    className={cn("shrink-0 font-mono text-xs", item.state === "failed" ? "text-destructive" : "text-muted-foreground")}
                  >
                    {item.state === "failed" ? item.error : item.state}
                  </span>
                </div>
                <Progress value={item.file.size ? Math.round((item.sent / item.file.size) * 100) : 0} aria-label={item.path} />
              </li>
            ))}
          </ul>
        )}
        {done > 0 && done === items.length && (
          <p className="mt-4 max-w-2xl text-muted-foreground text-xs">
            all in. the importer tags them and they show up in your library after the next scan.
          </p>
        )}
        {items.some((item) => item.state === "failed") && !busy.current && (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void run(items.filter((item) => item.state === "failed"))}>
            retry the failed ones
          </Button>
        )}
      </Content>
    </>
  );
}
