import { expect, test } from "bun:test";
import { appShortcuts } from "../app-shortcuts";
import { eventBinding, findConflicts, normalize } from "./shortcuts";

const noop = () => undefined;
// Stands in for the player, router and notifier: any method is a no-op.
const stub = new Proxy({}, { get: () => noop }) as never;

test("the default map has no two actions on the same key in a scope", () => {
  const shortcuts = appShortcuts({
    player: stub,
    go: stub,
    runListCommand: stub,
    notify: stub,
    togglePanel: noop,
    closeTopLayer: noop,
    openSearch: noop,
    toggleSearch: noop,
    openCheatSheet: noop,
    toggleFullScreen: noop,
    findInList: () => true,
    likeCurrent: noop,
    openMiniPlayer: noop,
    newPlaylist: noop,
    undo: noop,
    redo: noop,
  });
  expect(findConflicts(shortcuts)).toEqual([]);
  expect(findConflicts([...shortcuts, { id: "clash", keys: ["Shift+S"], scope: "global" }])).toEqual([["shift+s", "stop-after", "clash"]]);
});

test("bindings follow the physical key and spell modifiers one way", () => {
  // On AZERTY the key labelled A sits where QWERTY has Q; code-based matching keeps "q" on that physical key.
  expect(eventBinding({ code: "KeyQ", key: "a", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })).toBe("q");
  expect(eventBinding({ code: "ArrowRight", key: "ArrowRight", metaKey: false, ctrlKey: false, altKey: false, shiftKey: true })).toBe(
    "shift+arrowright",
  );
  expect(normalize("Shift+Mod+K")).toBe("mod+shift+k");
});
