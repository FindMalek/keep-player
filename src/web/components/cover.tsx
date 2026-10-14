import { Disc3Icon } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { coverSrcSet, coverUrl } from "@/lib/subsonic";
import { cn } from "@/lib/utils";

interface CoverProps {
  id: string | undefined;
  /** Drawn size in CSS pixels; picks the cached size (1x and 2x). */
  size: number;
  className?: string;
  alt?: string;
  /** Above-the-fold art (album hero, now playing): fetch first, no lazy loading. */
  priority?: boolean;
}

/**
 * Square album art. The square is always there (no layout shift); the image fades in once decoded. A record mark
 * stands in when there is no art or it fails.
 */
export function Cover({ id, size, className, alt = "", priority = false }: CoverProps) {
  const src = coverUrl(id, size);
  // Keyed by URL, so a component that switches covers (player bar, reused rows) starts over for the new one.
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const ready = src !== null && loaded === src;
  const missing = src === null || failed === src;
  return (
    <div className={cn("relative aspect-square overflow-hidden bg-card outline outline-muted", className)}>
      {!missing && !ready && <Skeleton className="absolute inset-0" />}
      {!missing && (
        <img
          // Remount per cover so a reused element (virtual lists, the player bar) never shows the previous art.
          key={src}
          src={src}
          srcSet={id ? coverSrcSet(id, size) : undefined}
          alt={alt}
          width={size}
          height={size}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          className={cn(
            "size-full object-cover transition-opacity duration-200 motion-reduce:transition-none",
            ready ? "opacity-100" : "opacity-0",
          )}
          ref={(image) => {
            // Cached covers can finish before React attaches onLoad.
            if (image?.complete && image.naturalWidth) setLoaded(src);
          }}
          onLoad={(event) => {
            void event.currentTarget
              .decode()
              .catch(() => undefined)
              .then(() => setLoaded(src));
          }}
          onError={() => setFailed(src)}
        />
      )}
      {missing && <Disc3Icon aria-hidden className="absolute inset-0 m-auto size-1/3 text-ring" strokeWidth={1} />}
    </div>
  );
}
