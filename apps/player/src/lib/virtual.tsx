import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { type RefObject, useLayoutEffect, useState } from "react";
import { usePageScroller } from "./page-scroll";

/** Lists shorter than this render every row: cheap, and the browser's find-in-page still sees them. */
export const VIRTUALIZE_FROM = 100;

/** Columns that fit a `repeat(auto-fill, minmax(min, 1fr))` grid of this element's width, kept in sync on resize. */
export function useColumns(ref: RefObject<HTMLElement | null>, min: number, gap: number): { columns: number; width: number } {
  const [size, setSize] = useState({ columns: 1, width: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const width = element.clientWidth;
      const columns = Math.max(1, Math.floor((width + gap) / (min + gap)));
      setSize((current) => (current.columns === columns && current.width === width ? current : { columns, width }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, min, gap]);
  return size;
}

/**
 * A virtualizer for a list that sits somewhere inside the page scroller: `scrollMargin` is the list's offset from the
 * top of the scrolled content, re-measured when the content above it changes size.
 */
export function usePageVirtualizer(
  listRef: RefObject<HTMLElement | null>,
  options: { count: number; estimateSize: (index: number) => number; overscan?: number; enabled?: boolean; scrollPaddingStart?: number },
): Virtualizer<HTMLElement, Element> {
  const scroller = usePageScroller();
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!scroller || !list) return;
    const update = () => setMargin(list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
    update();
    const observer = new ResizeObserver(update);
    if (list.parentElement) observer.observe(list.parentElement);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scroller, listRef]);
  return useVirtualizer({
    count: options.count,
    getScrollElement: () => scroller,
    estimateSize: options.estimateSize,
    overscan: options.overscan ?? 8,
    scrollMargin: margin,
    enabled: options.enabled ?? true,
    // Room for the sticky page header when jumping to a row.
    scrollPaddingStart: options.scrollPaddingStart ?? 44,
  });
}
