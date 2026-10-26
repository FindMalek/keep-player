import { type FocusEvent, useRef } from "react";

// A handler returns false for a command it doesn't do, so the global shortcut on the same key (↑ = volume, esc =
// close) still runs.
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

// Commands always reach the latest `handler`: the selection changes without focus moving.
export function useListNav(handler: ListHandler): {
  "data-shortcut-scope": "list";
  onFocusCapture: (event: FocusEvent<HTMLElement>) => void;
} {
  const latest = useRef(handler);
  latest.current = handler;
  return {
    "data-shortcut-scope": "list",
    onFocusCapture: (event) => {
      active = { element: event.currentTarget, handler: (command) => latest.current(command) };
    },
  };
}

const remembered = new Map<string, number>();

export function rememberFocus(index: number): void {
  remembered.set(window.location.pathname, index);
}

export function rememberedFocus(): number | undefined {
  return remembered.get(window.location.pathname);
}

export function focusWhenRendered(find: () => HTMLElement | null, tries = 10): void {
  const element = find();
  if (element) element.focus({ preventScroll: true });
  else if (tries > 0) requestAnimationFrame(() => focusWhenRendered(find, tries - 1));
}
