import { useEffect, useRef } from "react";
import { Cover } from "@/components/cover";
import { ListContextMenu, type MenuTarget } from "@/components/item-menu";
import { EmptyState } from "@/components/library";
import { Link } from "@/components/link";
import { length } from "@/lib/format";
import type { Album } from "@/lib/types";
import { usePageVirtualizer } from "@/lib/virtual";

const ROW = 44;

/** The albums page's list view: one dense row per album, virtualized like the artists list. */
export function AlbumRows({ albums, onNearEnd }: { albums: Album[]; onNearEnd?: () => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = usePageVirtualizer(listRef, { count: albums.length, estimateSize: () => ROW });
  const items = virtualizer.getVirtualItems();
  const last = items[items.length - 1];
  const nearEnd = Boolean(last && last.index >= albums.length - 20);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page must ask for the next one while still near the end
  useEffect(() => {
    if (nearEnd) onNearEnd?.();
  }, [nearEnd, onNearEnd, albums.length]);
  if (!albums.length) return <EmptyState>no albums</EmptyState>;
  const resolve = (element: Element): MenuTarget | null => {
    const album = albums[Number(element.closest("[data-album-index]")?.getAttribute("data-album-index") ?? Number.NaN)];
    return album ? { kind: "album", album } : null;
  };
  return (
    <ListContextMenu resolve={resolve}>
      <div ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {items.map((item) => {
          const album = albums[item.index];
          if (!album) return null;
          return (
            <Link
              key={album.id}
              href={`/album/${album.id}`}
              data-album-index={item.index}
              className="absolute inset-x-0 flex items-center gap-3 border-b px-1.5 hover:bg-card"
              style={{ height: ROW, transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` }}
            >
              <Cover id={album.coverArt} size={32} alt="" className="size-8 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{album.name}</span>
              <span className="hidden w-48 shrink-0 truncate text-[12px] text-muted-foreground sm:block">{album.artist}</span>
              <span className="w-10 shrink-0 text-right font-mono text-muted-foreground text-xs tabular-nums">{album.year ?? ""}</span>
              <span className="hidden w-16 shrink-0 text-right font-mono text-muted-foreground text-xs tabular-nums md:block">
                {album.songCount ? `${album.songCount} tr` : ""}
              </span>
              <span className="hidden w-20 shrink-0 text-right font-mono text-muted-foreground text-xs tabular-nums md:block">
                {album.duration ? length(album.duration) : ""}
              </span>
              <span className="hidden w-12 shrink-0 text-right font-mono text-muted-foreground text-xs tabular-nums md:block">
                {album.playCount ? `${album.playCount}×` : ""}
              </span>
            </Link>
          );
        })}
      </div>
    </ListContextMenu>
  );
}
