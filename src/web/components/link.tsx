import type { ComponentProps, MouseEvent } from "react";
import { navigate } from "@/lib/router";

/** In-app link: client-side navigation on plain clicks, the browser keeps cmd/ctrl/middle click. */
export function Link({ href, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  return (
    <a
      href={href}
      {...props}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) navigate(event);
      }}
    />
  );
}
