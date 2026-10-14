import type { ComponentProps, MouseEvent } from "react";
import { navigate } from "@/lib/router";
import { preloadRoute } from "@/routes";

/** In-app link: client-side navigation on plain clicks (the browser keeps cmd/ctrl/middle click); preloads the page on intent. */
export function Link({ href, onClick, onPointerEnter, onFocus, ...props }: ComponentProps<"a"> & { href: string }) {
  return (
    <a
      href={href}
      {...props}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        preloadRoute(href);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        preloadRoute(href);
      }}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) navigate(event);
      }}
    />
  );
}
