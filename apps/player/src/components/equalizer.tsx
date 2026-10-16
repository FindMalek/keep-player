import { cn } from "@/lib/utils";

/** Three bars that bounce while the track plays and rest when paused. */
export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className="inline-flex h-[11px] items-end gap-0.5" role="img" aria-label={playing ? "playing" : "paused"}>
      {["[animation-delay:0ms]", "[animation-delay:-300ms]", "[animation-delay:-600ms]"].map((delay) => (
        <i
          key={delay}
          className={cn("h-1 w-0.5 bg-foreground", playing && "animate-eq motion-reduce:h-2 motion-reduce:animate-none", delay)}
        />
      ))}
    </span>
  );
}
