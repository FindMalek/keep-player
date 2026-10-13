import { Disc3Icon } from "lucide-react";
import { useState } from "react";
import { coverUrl } from "@/lib/subsonic";
import { cn } from "@/lib/utils";

/** Square album art; the request asks for 2x `size` so covers stay sharp on retina. A record mark when there is none. */
export function Cover({ id, size, className, alt = "" }: { id: string | undefined; size: number; className?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const src = coverUrl(id, size * 2);
  return (
    <div className={cn("relative aspect-square overflow-hidden bg-card outline outline-muted", className)}>
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <Disc3Icon aria-hidden className="absolute inset-0 m-auto size-1/3 text-ring" strokeWidth={1} />
      )}
    </div>
  );
}
