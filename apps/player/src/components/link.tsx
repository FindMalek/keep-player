import { type ComponentProps, type MouseEvent, useRef } from "react";
import { prefetchPath } from "@/lib/queries";
import { navigate } from "@/lib/router";
import { preloadRoute } from "@/routes";

/** A pointer that rests on a link this long is probably going to click it. */
const INTENT_MS = 50;

/**
 * In-app link: client-side navigation on plain clicks (the browser keeps cmd/ctrl/middle click). On intent (hover or
 * keyboard focus) it loads the page's code and data, so the click shows a finished page.
 */
export function Link({ href, onClick, onPointerEnter, onPointerLeave, onFocus, ...props }: ComponentProps<"a"> & { href: string }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prefetch = () => {
    preloadRoute(href);
    prefetchPath(href);
  };
  return (
    <a
      href={href}
      {...props}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        preloadRoute(href);
        timer.current = setTimeout(() => prefetchPath(href), INTENT_MS);
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        clearTimeout(timer.current);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        prefetch();
      }}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) navigate(event);
      }}
    />
  );
}
