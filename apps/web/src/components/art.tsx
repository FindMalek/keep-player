import { cn } from "@keep/ui/lib/utils";
import type { CSSProperties } from "react";

/** Monochrome cover art drawn in CSS, the same style as the demo library's generated covers. */
const PATTERNS: CSSProperties[] = [
  {
    background:
      "radial-gradient(circle at 50% 50%, #f2f2f2 0 8%, #1a1a1a 9% 18%, #f2f2f2 19% 28%, #1a1a1a 29% 38%, #f2f2f2 39% 48%, #1a1a1a 49%)",
  },
  { background: "repeating-linear-gradient(135deg, #f2f2f2 0 9%, #1a1a1a 9% 18%)" },
  { background: "radial-gradient(circle at 50% 55%, #ffffff 0%, #8a8a8a 30%, #1a1a1a 62%)" },
  { background: "repeating-linear-gradient(90deg, #ececec 0 6%, #1a1a1a 6% 13%, #ececec 13% 15%, #1a1a1a 15% 24%)" },
  { background: "linear-gradient(90deg, #1a1a1a 0 30%, #9a9a9a 55%, #1a1a1a 80%)" },
  { background: "conic-gradient(from 45deg, #1a1a1a 0 25%, #f2f2f2 0 50%, #1a1a1a 0 75%, #f2f2f2 0)" },
];

export function Art({ seed, className }: { seed: number; className?: string }) {
  return <div aria-hidden className={cn("aspect-square shrink-0", className)} style={PATTERNS[seed % PATTERNS.length]} />;
}
