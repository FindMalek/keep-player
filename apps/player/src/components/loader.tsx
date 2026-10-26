import { cn } from "@/lib/utils";

const BARS = [0.4, 0.7, 1, 0.7, 0.4] as const;

// The symmetric wave: five bars swelling out from the middle, in the text color.
// One of the two things in the app that still move.
export function Loader({ className, label = "loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn("inline-flex size-4 items-center justify-center gap-0.5", className)}>
      {BARS.map((height, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
          key={index}
          aria-hidden
          className="w-0.5 origin-center animate-wave bg-current"
          style={{ height: `${height * 100}%`, animationDelay: `${Math.abs(index - 2) * -140}ms` }}
        />
      ))}
    </span>
  );
}
