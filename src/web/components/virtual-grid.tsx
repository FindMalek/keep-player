import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useColumns, usePageVirtualizer } from "@/lib/virtual";

interface VirtualGridProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Narrowest column, as in `minmax(min, 1fr)`. */
  min: number;
  gap: number;
  rowGap: number;
  /** Row height for a given column width (measured afterwards, so close is enough). */
  estimateRow: (columnWidth: number) => number;
  /** Below this many items everything renders as a plain CSS grid. */
  virtualizeFrom?: number;
  onNearEnd?: () => void;
  className?: string;
}

/**
 * A responsive grid that only renders the rows on screen. Columns follow the container width like
 * `repeat(auto-fill, minmax(min, 1fr))`; rows are measured as they render.
 */
export function VirtualGrid<T>({
  items,
  getKey,
  renderItem,
  min,
  gap,
  rowGap,
  estimateRow,
  virtualizeFrom = 60,
  onNearEnd,
  className,
}: VirtualGridProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const { columns, width } = useColumns(ref, min, gap);
  const virtual = items.length > virtualizeFrom;
  const rowCount = Math.ceil(items.length / columns);
  const columnWidth = (width - gap * (columns - 1)) / columns;
  const virtualizer = usePageVirtualizer(ref, {
    count: rowCount,
    estimateSize: () => estimateRow(columnWidth) + rowGap,
    overscan: 3,
    enabled: virtual,
  });
  const rows = virtualizer.getVirtualItems();
  const last = rows.at(-1)?.index ?? 0;
  useEffect(() => {
    if (virtual && onNearEnd && last >= rowCount * 0.8) onNearEnd();
  }, [virtual, onNearEnd, last, rowCount]);

  const style = { gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, columnGap: gap, rowGap };
  if (!virtual)
    return (
      <div ref={ref} className={cn("grid", className)} style={style}>
        {items.map((item) => (
          <div key={getKey(item)} className="min-w-0">
            {renderItem(item)}
          </div>
        ))}
      </div>
    );

  const margin = virtualizer.options.scrollMargin;
  return (
    <div ref={ref} className={cn("relative", className)} style={{ height: virtualizer.getTotalSize() }}>
      {rows.map((row) => (
        <div
          key={row.key}
          ref={virtualizer.measureElement}
          data-index={row.index}
          className="absolute inset-x-0 grid"
          style={{
            transform: `translateY(${row.start - margin}px)`,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            columnGap: gap,
            paddingBottom: rowGap,
          }}
        >
          {items.slice(row.index * columns, row.index * columns + columns).map((item) => (
            <div key={getKey(item)} className="min-w-0">
              {renderItem(item)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
