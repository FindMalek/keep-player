import { type MouseEvent, useSyncExternalStore } from "react";

const NAVIGATE = "keep:navigate";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(NAVIGATE, onChange);
  return () => window.removeEventListener(NAVIGATE, onChange);
}

const scroller = () => document.querySelector<HTMLElement>("[data-page-scroll]");

// Back/forward restores each entry's scroll once the page is tall enough (data may still arrive), giving up after 1 s.
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

let lastNavigation: "push" | "pop" = "push";

export function navigationType(): "push" | "pop" {
  return lastNavigation;
}

window.history.scrollRestoration = "manual";
window.addEventListener("popstate", (event) => {
  lastNavigation = "pop";
  window.dispatchEvent(new Event(NAVIGATE));
  restoreScroll((event.state as { scroll?: number } | null)?.scroll ?? 0);
});

function push(path: string): void {
  lastNavigation = "push";
  rememberScroll();
  window.history.pushState({ scroll: 0 }, "", path);
  window.dispatchEvent(new Event(NAVIGATE));
  scroller()?.scrollTo(0, 0);
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function navigate(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  const href = event.currentTarget.getAttribute("href");
  if (!href || href === window.location.pathname) return;
  push(href);
}

export function go(path: string): void {
  if (path === window.location.pathname + window.location.search) return;
  push(path);
}

/** Swap the current entry (a link that redirects): back skips it. */
export function replace(path: string): void {
  lastNavigation = "push";
  window.history.replaceState({ scroll: 0 }, "", path);
  window.dispatchEvent(new Event(NAVIGATE));
}

export function useSearchParam(name: string): string {
  return useSyncExternalStore(subscribe, () => new URLSearchParams(window.location.search).get(name) ?? "");
}
