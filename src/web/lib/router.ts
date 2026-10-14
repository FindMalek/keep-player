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

const scroller = () => document.querySelector<HTMLElement>("[data-page-scroll]");

/*
 * Scroll restoration: each history entry remembers where its page was scrolled. Back/forward puts it back once the
 * page is tall enough (data may still be arriving), giving up after a second.
 */
function rememberScroll(): void {
  window.history.replaceState({ ...window.history.state, scroll: scroller()?.scrollTop ?? 0 }, "");
}

function restoreScroll(top: number): void {
  const deadline = performance.now() + 1000;
  const attempt = () => {
    const element = scroller();
    if (!element) return;
    element.scrollTop = top;
    if (Math.abs(element.scrollTop - top) > 1 && performance.now() < deadline) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}

window.history.scrollRestoration = "manual";
window.addEventListener("popstate", (event) => restoreScroll((event.state as { scroll?: number } | null)?.scroll ?? 0));

function push(path: string): void {
  rememberScroll();
  window.history.pushState({ scroll: 0 }, "", path);
  window.dispatchEvent(new Event(NAVIGATE));
  scroller()?.scrollTo(0, 0);
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
  push(href);
}

/** Programmatic navigation (search results, keyboard actions). */
export function go(path: string): void {
  if (path === window.location.pathname + window.location.search) return;
  push(path);
}

export function useSearchParam(name: string): string {
  return useSyncExternalStore(subscribe, () => new URLSearchParams(window.location.search).get(name) ?? "");
}
