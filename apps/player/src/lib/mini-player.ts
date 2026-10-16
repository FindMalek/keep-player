import { useSyncExternalStore } from "react";
import { notify } from "./notify";

/*
 * The mini player: a Document Picture-in-Picture window (Chromium) that stays on top of everything. The app renders
 * into it with a portal, so it shares the player and the caches; this module only owns the window.
 */

interface DocumentPictureInPicture {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}
const pip = () => (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;

export const MINI_PLAYER_SUPPORTED = typeof window !== "undefined" && Boolean(pip());

let current: Window | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

/** Same styles and theme as the app: copy the stylesheets and the root's classes into the new window. */
function adopt(target: Window): void {
  for (const sheet of [...document.styleSheets]) {
    try {
      const style = target.document.createElement("style");
      style.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
      target.document.head.append(style);
    } catch {
      if (sheet.href) {
        const link = target.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.document.head.append(link);
      }
    }
  }
  target.document.documentElement.className = document.documentElement.className;
  target.document.title = "keep music";
}

export async function openMiniPlayer(): Promise<void> {
  const api = pip();
  if (!api) {
    notify({ message: "the mini player needs chrome or edge" });
    return;
  }
  if (current) return;
  const opened = await api.requestWindow({ width: 380, height: 132 }).catch(() => null);
  if (!opened) return;
  adopt(opened);
  current = opened;
  opened.addEventListener("pagehide", () => {
    current = null;
    emit();
  });
  emit();
}

export function useMiniWindow(): Window | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/** Let the browser open the mini player by itself when you leave the tab while music plays (Chromium's auto-PiP). */
export function setAutoMiniPlayer(enabled: boolean): void {
  try {
    navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, enabled ? () => void openMiniPlayer() : null);
  } catch {
    // Not supported here: the shortcut and the button still work.
  }
}
