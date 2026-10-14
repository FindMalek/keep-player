import type { FocusEvent } from "react";

/*
 * Keyboard navigation for lists and grids. The list that holds focus registers a handler; the registry's "list"
 * shortcuts (j/k, enter, x, …, see app-shortcuts.ts) send it commands. A handler returns false for a command it doesn't
 * do, so the global shortcut on the same key (↑ = volume, esc = close) still runs.
 */
export type ListCommand =
  | "down"
  | "up"
  | "left"
  | "right"
  | "first"
  | "last"
  | "extend-down"
  | "extend-up"
  | "toggle"
  | "select-all"
  | "clear"
  | "play"
  | "play-next"
  | "queue"
  | "open"
  | "remove"
  | "move-up"
  | "move-down";

export type ListHandler = (command: ListCommand) => boolean;

let active: { element: Element; handler: ListHandler } | null = null;

export function runListCommand(command: ListCommand): boolean {
  if (!active?.element.contains(document.activeElement)) return false;
  return active.handler(command);
}

/** Props for a list container: marks the "list" shortcut scope and makes it the target while focus is inside. */
export function listProps(handler: ListHandler): {
  "data-shortcut-scope": "list";
  onFocusCapture: (event: FocusEvent<HTMLElement>) => void;
} {
  return {
    "data-shortcut-scope": "list",
    onFocusCapture: (event) => {
      active = { element: event.currentTarget, handler };
    },
  };
}

/** Last focused position per page, so back/forward puts focus where it was. */
const remembered = new Map<string, number>();

export function rememberFocus(index: number): void {
  remembered.set(window.location.pathname, index);
}

export function rememberedFocus(): number | undefined {
  return remembered.get(window.location.pathname);
}

/** Focus the element for `index` once it exists (virtual lists render it after scrolling there). */
export function focusWhenRendered(find: () => HTMLElement | null, tries = 10): void {
  const element = find();
  if (element) element.focus({ preventScroll: true });
  else if (tries > 0) requestAnimationFrame(() => focusWhenRendered(find, tries - 1));
}
