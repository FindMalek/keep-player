import { useLayoutEffect, useRef, useState } from "react";

const scrollTops = new WeakMap<HTMLElement, number>();

/**
 * The page's scroll container as a detached element that pages render into through a portal. Layouts only place it
 * (`PageSlot`), so switching layout (opening the queue loads the resizable split view) never remounts the page.
 */
export function usePageHost(): HTMLDivElement {
  const [host] = useState(() => {
    const element = document.createElement("div");
    element.className = "h-full overflow-y-auto overscroll-contain outline-none";
    element.dataset.pageScroll = "";
    // Target of the "skip to content" link; focusable from script only.
    element.id = "content";
    element.tabIndex = -1;
    // Moving an element in the DOM resets its scroll position, so remember it.
    element.addEventListener("scroll", () => scrollTops.set(element, element.scrollTop), { passive: true });
    return element;
  });
  return host;
}

export function PageSlot({ host }: { host: HTMLDivElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.appendChild(host);
    host.scrollTop = scrollTops.get(host) ?? 0;
  }, [host]);
  return <div ref={ref} className="h-full min-h-0" />;
}
