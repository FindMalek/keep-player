import { useEffect, useRef, useSyncExternalStore } from "react";

/*
 * Every keyboard shortcut lives here: one registry that the key listener, the cheat sheet, the command palette and the
 * tooltips all read, so nothing is written down twice.
 *
 * Keys are written like "space", "shift+arrowright", "mod+k" (⌘ on macOS, Ctrl elsewhere) or "g h" (a chord: g, then h
 * within a second). Letters and digits match the physical key (`event.code`), so shortcuts stay put on AZERTY & co.
 */

export type ShortcutGroup = "playback" | "navigation" | "panels" | "lists";

/**
 * Where a shortcut works. Global ones never fire while typing or inside a dialog, menu or the command palette; the
 * component that owns a narrower scope (a focused list, a dialog) registers its own and they win.
 */
export type Scope = "global" | "list" | "modal";

export interface Shortcut {
  id: string;
  /** Default bindings; the first is the one shown in hints. */
  keys: string[];
  label: string;
  group: ShortcutGroup;
  scope: Scope;
  /** Return `false` when it doesn't apply right now, so the next matching shortcut (e.g. the global one) runs. */
  // biome-ignore lint/suspicious/noConfusingVoidType: most handlers return nothing; only list handlers say "not mine"
  run: (event: KeyboardEvent) => void | boolean;
  /** Shown in the cheat sheet but handled elsewhere (e.g. ⌘B by the sidebar itself). */
  passive?: boolean;
}

const CHORD_MS = 1000;
const OVERRIDES_KEY = "keep-player:shortcuts";

export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** "shift+mod+k" → "mod+shift+k": one spelling per combination. */
export function normalize(binding: string): string {
  return binding
    .toLowerCase()
    .split(" ")
    .map((step) => {
      const parts = step.split("+");
      const key = parts.pop() ?? "";
      const modifiers = ["mod", "ctrl", "alt", "shift"].filter((name) => parts.includes(name));
      return [...modifiers, key].join("+");
    })
    .join(" ");
}

const NAMED: Record<string, string> = {
  Space: "space",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  Comma: ",",
  Period: ".",
  Slash: "/",
  BracketLeft: "[",
  BracketRight: "]",
  Backspace: "backspace",
  Escape: "escape",
  Enter: "enter",
  Delete: "delete",
  Home: "home",
  End: "end",
  Minus: "-",
  Equal: "=",
};

/** The binding a key event produces, e.g. "mod+shift+k", or null for a bare modifier press. */
export function eventBinding(event: Pick<KeyboardEvent, "code" | "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): string | null {
  let key: string | undefined;
  if (event.code.startsWith("Key")) key = event.code.slice(3).toLowerCase();
  else if (event.code.startsWith("Digit")) key = event.code.slice(5);
  else key = NAMED[event.code];
  // "?" is shift+/ on most layouts; spell it as typed.
  if (event.key === "?") return "?";
  if (!key) return null;
  const mod = IS_MAC ? event.metaKey : event.ctrlKey;
  return normalize(
    [
      mod && "mod",
      !IS_MAC && event.metaKey && "meta",
      IS_MAC && event.ctrlKey && "ctrl",
      event.altKey && "alt",
      event.shiftKey && "shift",
      key,
    ]
      .filter(Boolean)
      .join("+"),
  );
}

const SYMBOLS: Record<string, string> = {
  mod: IS_MAC ? "⌘" : "ctrl",
  ctrl: "ctrl",
  alt: IS_MAC ? "⌥" : "alt",
  shift: "⇧",
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  backspace: "⌫",
  escape: "esc",
  enter: "↵",
  delete: "del",
};

/** How a binding is drawn: one array per chord step, one string per key, e.g. "g h" → [["g"], ["h"]]. */
export function displayKeys(binding: string): string[][] {
  return normalize(binding)
    .split(" ")
    .map((step) => step.split("+").map((part) => layoutLabels.get(part) ?? SYMBOLS[part] ?? part));
}

/** On layouts like AZERTY, show the character printed on the physical key we match. */
const layoutLabels = new Map<string, string>();
type KeyboardWithLayout = { getLayoutMap?: () => Promise<Map<string, string>> };
void (navigator as unknown as { keyboard?: KeyboardWithLayout }).keyboard
  ?.getLayoutMap?.()
  .then((layout) => {
    for (const [code, character] of layout)
      if (code.startsWith("Key") && character) layoutLabels.set(code.slice(3).toLowerCase(), character.toLowerCase());
    emit();
  })
  .catch(() => undefined);

/** Bindings that collide within a scope (same key, two actions). A unit test keeps the defaults free of them. */
export function findConflicts(shortcuts: Pick<Shortcut, "id" | "keys" | "scope">[]): [string, string, string][] {
  const seen = new Map<string, string>();
  const conflicts: [string, string, string][] = [];
  for (const shortcut of shortcuts)
    for (const binding of shortcut.keys) {
      const key = `${shortcut.scope}:${normalize(binding)}`;
      const other = seen.get(key);
      if (other && other !== shortcut.id) conflicts.push([normalize(binding), other, shortcut.id]);
      else seen.set(key, shortcut.id);
    }
  return conflicts;
}

// --- registry ---

const registry = new Map<string, Shortcut>();
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function readOverrides(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? "{}") as Record<string, string[]>;
  } catch {
    return {};
  }
}

let overrides = readOverrides();

/** The bindings in effect for a shortcut: the user's own if rebound, else the defaults. */
export function bindingsOf(shortcut: Pick<Shortcut, "id" | "keys">): string[] {
  return overrides[shortcut.id] ?? shortcut.keys;
}

export function register(shortcut: Shortcut): () => void {
  registry.set(shortcut.id, shortcut);
  emit();
  return () => {
    if (registry.get(shortcut.id) === shortcut) registry.delete(shortcut.id);
    emit();
  };
}

export function allShortcuts(): Shortcut[] {
  return [...registry.values()];
}

/** Re-renders when shortcuts or bindings change; returns the registry contents. */
export function useShortcutList(): Shortcut[] {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
  return allShortcuts();
}

/** The keys to show next to a control for shortcut `id` (first binding), or undefined. */
export function useHintKeys(id: string): string[] | undefined {
  const shortcut = useShortcutList().find((item) => item.id === id);
  const binding = shortcut && bindingsOf(shortcut)[0];
  return binding ? displayKeys(binding).flat() : undefined;
}

export function rebind(id: string, keys: string[]): void {
  overrides = { ...overrides, [id]: keys.map(normalize) };
  saveOverrides();
}

export function resetBindings(id?: string): void {
  if (id) {
    const { [id]: _removed, ...rest } = overrides;
    overrides = rest;
  } else overrides = {};
  saveOverrides();
}

/** The user's rebinds as JSON, for backup or moving to another browser. */
export function exportBindings(): string {
  return JSON.stringify(overrides, null, 2);
}

function saveOverrides(): void {
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // Kept for this session only.
  }
  emit();
}

/**
 * Register shortcuts from a component for as long as it's mounted. `make` may close over props and state: the
 * registered handlers always call the latest version, so this never re-registers on render.
 */
export function useShortcuts(make: () => Shortcut[]): void {
  const latest = useRef(make);
  latest.current = make;
  useEffect(() => {
    const unregister = latest.current().map((shortcut) =>
      register({
        ...shortcut,
        run: (event) =>
          latest
            .current()
            .find((item) => item.id === shortcut.id)
            ?.run(event),
      }),
    );
    return () => {
      for (const off of unregister) off();
    };
  }, []);
}

// --- the one listener ---

/** A chord's first key while it waits for the second, for the little "g…" hint. */
let pending: string | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;

export function usePendingChord(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
  );
}

function setPending(value: string | null): void {
  pending = value;
  clearTimeout(pendingTimer);
  if (value) pendingTimer = setTimeout(() => setPending(null), CHORD_MS);
  emit();
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/** Inside a dialog, menu, select or the palette only that layer's own shortcuts apply (our own lists aren't layers). */
function inLayer(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[role=dialog],[role=alertdialog],[role=menu]")) return true;
  return target.closest("[role=listbox]") !== null && target.closest("[data-shortcut-scope=list]") === null;
}

function scopeAllowed(scope: Scope, target: EventTarget | null): boolean {
  if (scope === "modal") return true;
  if (inLayer(target)) return false;
  if (scope === "list") return target instanceof Element && target.closest("[data-shortcut-scope=list]") !== null;
  return true;
}

export function handleKey(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) return;
  const binding = eventBinding(event);
  if (!binding) return;
  const typing = isTyping(event.target);
  const candidates = [...registry.values()].filter((shortcut) => !shortcut.passive && scopeAllowed(shortcut.scope, event.target));
  // Narrower scopes first: a focused list's "enter" beats any global one.
  const rank: Record<Scope, number> = { modal: 0, list: 1, global: 2 };
  candidates.sort((a, b) => rank[a.scope] - rank[b.scope]);

  const sequence = pending ? `${pending} ${binding}` : binding;
  const matches = candidates.filter((shortcut) => bindingsOf(shortcut).some((keys) => normalize(keys) === sequence));
  // Typing in a field only lets modifier shortcuts (⌘K) through.
  if (matches.length && (!typing || binding.includes("mod+"))) {
    setPending(null);
    for (const shortcut of matches) {
      if (shortcut.run(event) === false) continue;
      // Space on a focused button would also "click" it; the shortcut wins.
      event.preventDefault();
      return;
    }
    return;
  }
  if (typing) return;
  const startsChord = candidates.some((shortcut) => bindingsOf(shortcut).some((keys) => normalize(keys).startsWith(`${binding} `)));
  if (startsChord && !pending) {
    event.preventDefault();
    setPending(binding);
    return;
  }
  if (pending) setPending(null);
}

let installed = false;

/** Mount the single key listener (once, for the app's lifetime). */
export function installShortcuts(): void {
  if (installed) return;
  installed = true;
  window.addEventListener("keydown", handleKey);
}
