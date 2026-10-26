import { notify } from "./notify";
import { onAccountChange } from "./subsonic";

/*
 * One undo history for everything you change here (#63): queue edits, playlist edits, likes. ⌘Z undoes the latest,
 * ⌘⇧Z redoes it, and every toast's "undo" goes through the same history so the two never disagree. The last 50
 * actions, for this tab's lifetime.
 */

export interface Undoable {
  /** What was done, in the past tense: "cleared your queue". */
  label: string;
  undo: () => unknown;
  redo: () => unknown;
}

const LIMIT = 50;
const past: Undoable[] = [];
const future: Undoable[] = [];

/** Remember an action that just happened. A new action drops whatever could have been redone. */
export function record(action: Undoable): Undoable {
  past.push(action);
  if (past.length > LIMIT) past.shift();
  future.length = 0;
  return action;
}

async function run(step: () => unknown): Promise<boolean> {
  try {
    await step();
    return true;
  } catch {
    return false;
  }
}

/** Undo `action` (a toast's button), or the latest one (⌘Z). */
export async function undo(action?: Undoable): Promise<void> {
  const at = action ? past.lastIndexOf(action) : past.length - 1;
  const target = past[at];
  if (!target) {
    if (!action) notify({ message: "nothing to undo", id: "undo" });
    return;
  }
  past.splice(at, 1);
  if (!(await run(target.undo))) {
    notify({ kind: "error", message: `couldn't undo: ${target.label}`, id: "undo" });
    return;
  }
  future.push(target);
  notify({ message: `undid: ${target.label}`, id: "undo", action: { label: "redo", onClick: () => void redo() } });
}

export async function redo(): Promise<void> {
  const target = future.pop();
  if (!target) {
    notify({ message: "nothing to redo", id: "undo" });
    return;
  }
  if (!(await run(target.redo))) {
    notify({ kind: "error", message: `couldn't redo: ${target.label}`, id: "undo" });
    return;
  }
  past.push(target);
  notify({ message: `redid: ${target.label}`, id: "undo", action: { label: "undo", onClick: () => void undo(target) } });
}

/** Record an action and say so, with an undo button. */
export function done(action: Undoable): void {
  record(action);
  notify({ message: action.label, action: { label: "undo", onClick: () => void undo(action) } });
}

/** A new account starts with an empty history. */
function clearHistory(): void {
  past.length = 0;
  future.length = 0;
}

onAccountChange(clearHistory);
