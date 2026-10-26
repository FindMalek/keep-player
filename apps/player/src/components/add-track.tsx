import { Badge } from "@keep/ui/components/badge";
import { Button } from "@keep/ui/components/button";
import { Input } from "@keep/ui/components/input";
import { Skeleton } from "@keep/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckIcon, CircleIcon, Loader2Icon, MusicIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clock } from "@/lib/format";
import { player } from "@/lib/player";
import { followAdded, isLink, SOURCE_LABEL, stepOf, WISH_STEPS, type WishPreview, waitForSong, wishlist } from "@/lib/wishlist";

function Card({ meta }: { meta: WishPreview }) {
  return (
    <div className="flex items-center gap-3 border p-3">
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden bg-muted text-muted-foreground">
        {meta.cover ? <img src={meta.cover} alt="" className="size-full object-cover" /> : <MusicIcon className="size-6" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium text-base">{meta.title}</span>
        <span className="truncate text-muted-foreground text-xs">
          {meta.artists.join(", ") || "unknown artist"} · {clock(meta.durationMs / 1000)}
        </span>
        <Badge variant="outline" className="w-fit font-mono font-normal">
          {SOURCE_LABEL[meta.source]}
        </Badge>
      </div>
    </div>
  );
}

function Steps({ stage }: { stage: string }) {
  const current = stepOf(stage);
  return (
    <ol aria-label="progress" className="flex flex-col gap-1.5 font-mono text-xs">
      {WISH_STEPS.map((step, index) => {
        const done = index < current || stage === "placed";
        const active = index === current && stage !== "placed";
        return (
          <li key={step.label} className={done || active ? "flex items-center gap-2" : "flex items-center gap-2 text-faint"}>
            {done ? (
              <CheckIcon className="size-3.5" />
            ) : active ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <CircleIcon className="size-3.5" />
            )}
            <span className={active ? "text-foreground" : "text-muted-foreground"}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Add a song to the library through Lyterion: a link (YouTube, SoundCloud, Deezer) or a name. Shows what it understood
 * before anything downloads, then follows the work step by step and offers to play it. Closing it keeps the work going;
 * a toast says when the song lands.
 */
export function AddTrack({ initial, onBack, onClose }: { initial: string; onBack: () => void; onClose: () => void }) {
  const [text, setText] = useState(initial);
  const [asked, setAsked] = useState(initial.trim());
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const preview = useQuery({
    queryKey: ["wishlist-preview", asked],
    queryFn: () => wishlist.preview(asked),
    enabled: asked.length >= 2,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const add = useMutation({ mutationFn: () => wishlist.add(asked) });
  const added = add.data;
  const state = useQuery({
    queryKey: ["wishlist-status", added?.recordingId],
    queryFn: () => wishlist.status(added?.recordingId ?? ""),
    enabled: !!added,
    refetchInterval: (query) =>
      query.state.status !== "error" && (query.state.data?.status === "working" || !query.state.data) ? 2000 : false,
  });
  const status = state.data?.status;
  const placed = status === "placed";
  const song = useQuery({
    queryKey: ["wishlist-song", added?.recordingId],
    queryFn: () => (added ? waitForSong(added.meta) : null),
    enabled: placed,
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Closed before it finished: a toast takes over.
  const live = useRef<{ id: string; meta: WishPreview } | null>(null);
  live.current =
    added && status !== "placed" && status !== "missing" && status !== "review" ? { id: added.recordingId, meta: added.meta } : null;
  useEffect(
    () => () => {
      if (live.current) followAdded(live.current.id, live.current.meta);
    },
    [],
  );

  const ready = preview.data && !add.isPending && !added;
  const submit = () => {
    const next = text.trim();
    if (next.length < 2 || add.isPending || added) return;
    if (next !== asked) setAsked(next);
    else if (preview.data) add.mutate();
  };
  const error = (preview.error ?? add.error)?.message;

  return (
    <div className="flex min-h-0 flex-col gap-3 p-3">
      <Input
        ref={input}
        value={text}
        disabled={!!added}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape" && !added) {
            event.preventDefault();
            event.stopPropagation();
            onBack();
          }
        }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text").trim();
          if (isLink(pasted) && !text.trim()) {
            event.preventDefault();
            setText(pasted);
            setAsked(pasted);
          }
        }}
        placeholder="paste a youtube, soundcloud or deezer link, or type a song"
        aria-label="song to add"
        className="h-10 font-mono text-sm"
      />
      {asked.length < 2 && (
        <p className="px-1 text-muted-foreground text-xs">
          it's found across your sources, checked, tagged and placed in your library. you can keep listening meanwhile.
        </p>
      )}
      {preview.isFetching && asked === text.trim() && (
        <div className="flex items-center gap-3 border p-3" aria-busy>
          <Skeleton className="size-16 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      )}
      {preview.data && asked === text.trim() && <Card meta={added?.meta ?? preview.data} />}
      {error && (
        <p role="alert" className="px-1 text-destructive text-xs">
          {error}
        </p>
      )}
      {added && state.data && status === "working" && <Steps stage={state.data.stage} />}
      {added && !state.data && !state.isError && <Steps stage="queued" />}
      {added && state.isError && (
        <div className="flex items-center justify-between gap-3 border p-3">
          <span className="text-muted-foreground text-sm">{state.error.message}</span>
          <Button size="sm" variant="outline" onClick={() => state.refetch()}>
            try again
          </Button>
        </div>
      )}
      {placed && (
        <div className="flex items-center justify-between gap-3 border p-3">
          <span className="flex items-center gap-2 text-sm">
            <CheckIcon className="size-4" /> in your library
          </span>
          <Button
            size="sm"
            disabled={!song.data}
            onClick={() => {
              if (!song.data) return;
              player.play([song.data], 0);
              onClose();
            }}
          >
            {song.isPending ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
            {song.data ? "play now" : song.isPending ? "scanning…" : "not found yet"}
          </Button>
        </div>
      )}
      {placed && song.isSuccess && !song.data && (
        <div className="flex items-center justify-between gap-3 border p-3">
          <span className="text-muted-foreground text-sm">it's placed, but navidrome hasn't shown it yet.</span>
          <Button size="sm" variant="outline" onClick={() => song.refetch()}>
            check again
          </Button>
        </div>
      )}
      {status === "review" && (
        <p className="border p-3 text-muted-foreground text-sm">
          found something, but not sure it's the right one. it's waiting in lyterion's review queue.
        </p>
      )}
      {(status === "missing" || status === "gone") && (
        <div className="flex items-center justify-between gap-3 border p-3">
          <span className="text-muted-foreground text-sm">no good copy found on any source.</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              add.reset();
              add.mutate();
            }}
          >
            try again
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 font-mono text-[11px] text-faint">
        <Button
          variant="link"
          size="xs"
          className="h-auto px-0 font-mono text-[11px] text-muted-foreground"
          onClick={added ? onClose : onBack}
        >
          {added ? "close, it keeps going" : "esc  back to search"}
        </Button>
        {!added && (
          <Button size="sm" disabled={add.isPending || (!ready && !(text.trim().length >= 2 && text.trim() !== asked))} onClick={submit}>
            {add.isPending && <Loader2Icon className="animate-spin" />}
            {ready ? "add to library ↵" : "look it up ↵"}
          </Button>
        )}
      </div>
    </div>
  );
}
