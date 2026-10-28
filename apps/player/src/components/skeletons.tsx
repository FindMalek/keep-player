import { Skeleton } from "@lodesong/ui/components/skeleton";
import { type ReactNode, useEffect, useState } from "react";

// Exact geometry of what replaces them (CLS 0, e2e/cls.e2e.ts); none shows in the first 150 ms,
// so fast loads never flash.

const SHOW_AFTER_MS = 150;

export function Delayed({ ms = SHOW_AFTER_MS, children }: { ms?: number; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return shown ? children : null;
}

/** Track rows: the column header plus `count` rows of 34 px, like TrackList. `immediate` when content follows below. */
export function TrackListSkeleton({ count, immediate = false }: { count: number; immediate?: boolean }) {
  const rows = (
    <div aria-hidden className="text-body">
      <div className="h-6 border-b" />
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
        <div key={index} className="flex h-8.5 items-center gap-3 border-muted border-b px-2">
          <Skeleton className="h-3 w-5" />
          <Skeleton className="h-3" style={{ width: `${30 + ((index * 37) % 35)}%` }} />
          <Skeleton className="ml-auto h-3 w-9" />
        </div>
      ))}
    </div>
  );
  return immediate ? rows : <Delayed>{rows}</Delayed>;
}

export function HeroSkeleton() {
  return (
    <Delayed>
      <header aria-hidden className="flex items-end gap-5 border-b px-5 pt-4.5 pb-4">
        <Skeleton className="aspect-square w-38 shrink-0 short:w-22" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-4.5 w-14" />
          <Skeleton className="h-7 w-2/5" />
          <Skeleton className="h-4 w-1/4" />
          <div className="mt-1 flex gap-1.5">
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
      </header>
    </Delayed>
  );
}

export function ArtistRowsSkeleton({ count }: { count: number }) {
  return (
    <Delayed>
      <div aria-hidden className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 pl-12">
        {Array.from({ length: count }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
          <div key={index} className="flex h-6.5 items-center justify-between px-1.5">
            <Skeleton className="h-3" style={{ width: `${40 + ((index * 29) % 40)}%` }} />
            <Skeleton className="h-3 w-4" />
          </div>
        ))}
      </div>
    </Delayed>
  );
}

export function ResultGroupSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Delayed>
      <div aria-hidden className="flex flex-col gap-1 p-1">
        <Skeleton className="mx-2 my-1.5 h-2.5 w-12" />
        {Array.from({ length: count }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
          <div key={index} className="flex items-center gap-2 px-2 py-1.5">
            <Skeleton className="size-8 shrink-0" />
            <div className="flex flex-1 flex-col gap-1">
              <Skeleton className="h-3" style={{ width: `${35 + ((index * 23) % 30)}%` }} />
              <Skeleton className="h-2.5 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </Delayed>
  );
}
