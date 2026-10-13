import { type MouseEvent, useSyncExternalStore } from "react";

const NAVIGATE = "keep:navigate";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE, onChange);
  };
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

/** Click handler for in-app links; leaves cmd/ctrl-click to the browser. */
export function navigate(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  const href = event.currentTarget.getAttribute("href");
  if (!href || href === window.location.pathname) return;
  window.history.pushState(null, "", href);
  window.dispatchEvent(new Event(NAVIGATE));
  document.querySelector(".page")?.scrollTo(0, 0);
}

/** Programmatic navigation (search results, keyboard actions). */
export function go(path: string): void {
  if (path === window.location.pathname + window.location.search) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAVIGATE));
  document.querySelector(".page")?.scrollTo(0, 0);
}

export function useSearchParam(name: string): string {
  return useSyncExternalStore(subscribe, () => new URLSearchParams(window.location.search).get(name) ?? "");
}
