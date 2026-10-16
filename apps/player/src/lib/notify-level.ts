import type { ToastLevel } from "./settings";

interface Showable {
  kind?: "info" | "error";
  action?: unknown;
  cancel?: unknown;
}

/**
 * Errors always show. At "important" so does anything with a button (an undo, an offer to resume), because ignoring
 * those costs you something; "all" adds the plain confirmations ("added to the queue").
 */
export function shouldShow(level: ToastLevel, notice: Showable): boolean {
  if (notice.kind === "error") return true;
  if (level === "all") return true;
  return level === "important" && Boolean(notice.action || notice.cancel);
}
