import { cn } from "@/lib/utils";

const BARS = [0.4, 0.7, 1, 0.7, 0.4] as const;

/**
 * The loading mark: five bars that swell outward from the middle, mirrored left and right (the "symmetric wave").
 * Monochrome (it takes the text color), sized by `className` (default 1rem).
 * One of the two things in the app that still move.
 */
export function Loader({ className, label = "loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn("inline-flex size-4 items-center justify-center gap-[2px]", className)}>
      {BARS.map((height, index) => (
        <span
          // Index is the identity: the bars never reorder.
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
          key={index}
          aria-hidden
          className="w-[2px] origin-center animate-wave bg-current"
          style={{ height: `${height * 100}%`, animationDelay: `${Math.abs(index - 2) * -140}ms` }}
        />
      ))}
    </span>
  );
}
