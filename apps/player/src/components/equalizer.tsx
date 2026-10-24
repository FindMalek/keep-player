import { cn } from "@/lib/utils";

/** Three bars, tall while the track plays and low when paused. They don't bounce: the app has no motion. */
export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className="inline-flex h-[11px] items-end gap-0.5" role="img" aria-label={playing ? "playing" : "paused"}>
      {["h-2", "h-[11px]", "h-1.5"].map((height) => (
        <i key={height} className={cn("w-0.5 bg-foreground", playing ? height : "h-1")} />
      ))}
    </span>
  );
}
