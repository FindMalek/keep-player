import { notify } from "./notify";
import { allShortcuts, bindingsOf, displayKeys } from "./shortcuts";

/*
 * Gentle shortcut teaching: a first-run tip about "?", and after you click a control with the mouse three times, one
 * toast with its shortcut. Each tip shows once; all of it can be turned off.
 */
const KEY = "keep-player:tips";

interface TipState {
  clicks: Record<string, number>;
  shown: string[];
  off: boolean;
  welcomed: boolean;
}

function read(): TipState {
  try {
    return { clicks: {}, shown: [], off: false, welcomed: false, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { clicks: {}, shown: [], off: false, welcomed: false };
  }
}

function write(state: TipState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Tips just repeat next time.
  }
}

export function tipsEnabled(): boolean {
  return !read().off;
}

export function setTipsEnabled(enabled: boolean): void {
  write({ ...read(), off: !enabled });
}

/** A mouse click on a control that has shortcut `id`; the third one shows its keys once. */
export function noteMouseUse(id: string): void {
  const state = read();
  if (state.off || state.shown.includes(id)) return;
  const count = (state.clicks[id] ?? 0) + 1;
  const shortcut = allShortcuts().find((item) => item.id === id);
  const binding = shortcut && bindingsOf(shortcut)[0];
  if (count >= 3 && shortcut && binding) {
    write({ ...state, clicks: { ...state.clicks, [id]: count }, shown: [...state.shown, id] });
    notify({
      message: `tip: ${shortcut.label} is ${displayKeys(binding)
        .map((step) => step.join(""))
        .join(" then ")}`,
    });
  } else write({ ...state, clicks: { ...state.clicks, [id]: count } });
}

/** Once per browser: point at the cheat sheet. */
export function welcomeTip(openCheatSheet: () => void): void {
  const state = read();
  if (state.welcomed || state.off) return;
  write({ ...state, welcomed: true });
  notify({ message: "press ? anytime to see every keyboard shortcut", action: { label: "show", onClick: openCheatSheet } });
}

const ONBOARDED_KEY = "keep-player:onboarded";

/** Whether this browser went through (or skipped) the first-run setup. */
export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) !== null;
  } catch {
    return true;
  }
}

/** First run done: it already pointed at "?", so the welcome tip doesn't repeat it. */
export function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, String(Date.now()));
  } catch {
    // Shown again next time; harmless.
  }
  write({ ...read(), welcomed: true });
}
