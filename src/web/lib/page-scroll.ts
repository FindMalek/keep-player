import { createContext, useContext } from "react";

/** The page's scroll container (the portal host from components/page-host). Lists virtualize against it. */
export const PageScrollContext = createContext<HTMLElement | null>(null);

export function usePageScroller(): HTMLElement | null {
  return useContext(PageScrollContext);
}
