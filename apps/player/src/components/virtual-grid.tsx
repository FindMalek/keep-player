import { type ReactNode, useEffect, useRef } from "react";
import { focusWhenRendered, type ListCommand, rememberedFocus, rememberFocus, useListNav } from "@/lib/list-nav";
import { navigationType } from "@/lib/router";
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
  virtualizeFrom?: number;
  onNearEnd?: () => void;
  className?: string;
  actions?: { open?: (item: T) => void; play?: (item: T) => void; playNext?: (item: T) => void; queue?: (item: T) => void };
}

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
  actions,
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

  const focusItem = (index: number) => {
    const target = Math.max(0, Math.min(items.length - 1, index));
    if (virtual) virtualizer.scrollToIndex(Math.floor(target / columns), { align: "auto" });
    focusWhenRendered(
      () => ref.current?.querySelector<HTMLElement>(`[data-grid-index="${target}"] a, [data-grid-index="${target}"] button`) ?? null,
    );
    rememberFocus(target);
  };
  const handler = (command: ListCommand): boolean => {
    const current = Number(document.activeElement?.closest("[data-grid-index]")?.getAttribute("data-grid-index") ?? -1);
    const item = items[current];
    const steps: Partial<Record<ListCommand, number>> = { left: -1, right: 1, up: -columns, down: columns };
    const step = steps[command];
    if (step !== undefined) {
      focusItem(current < 0 ? 0 : current + step);
      return true;
    }
    if (command === "first" || command === "last") {
      focusItem(command === "first" ? 0 : items.length - 1);
      return true;
    }
    const action = { play: actions?.open ?? actions?.play, open: actions?.open, "play-next": actions?.playNext, queue: actions?.queue }[
      command as string
    ];
    if (!item || !action) return false;
    action(item);
    return true;
  };
  // Back/forward: put focus back on the card it was on.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the grid first has items
  useEffect(() => {
    const remembered = rememberedFocus();
    if (navigationType() === "pop" && remembered !== undefined && items.length) focusItem(remembered);
  }, [items.length > 0]);

  const listNav = useListNav(handler);

  const style = { gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, columnGap: gap, rowGap };
  if (!virtual)
    return (
      <div ref={ref} className={cn("grid", className)} style={style} {...listNav}>
        {items.map((item, index) => (
          <div key={getKey(item)} className="min-w-0" data-grid-index={index}>
            {renderItem(item)}
          </div>
        ))}
      </div>
    );

  const margin = virtualizer.options.scrollMargin;
  return (
    <div ref={ref} className={cn("relative", className)} style={{ height: virtualizer.getTotalSize() }} {...listNav}>
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
          {items.slice(row.index * columns, row.index * columns + columns).map((item, column) => (
            <div key={getKey(item)} className="min-w-0" data-grid-index={row.index * columns + column}>
              {renderItem(item)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
