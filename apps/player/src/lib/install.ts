import { useSyncExternalStore } from "react";

/*
 * "Install lodesong" (#53): Chromium offers to install a PWA through `beforeinstallprompt`, fired once early, so it's
 * caught at load and kept for the settings page's button. Safari and Firefox install from their own menus instead.
 */

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPrompt | null = null;
let installed = typeof window !== "undefined" && matchMedia("(display-mode: standalone)").matches;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

if (typeof window !== "undefined") {
  // Added here, not in index.html: the bundler would try to resolve these server-made files as build inputs.
  for (const [rel, href] of [
    ["manifest", "/manifest.webmanifest"],
    ["apple-touch-icon", "/icons/192.png"],
  ])
    document.head.append(Object.assign(document.createElement("link"), { rel, href }));
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPrompt;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export type InstallState = "installed" | "available" | "browser-menu";

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (installed ? "installed" : deferred ? "available" : "browser-menu"),
  );
}

export async function install(): Promise<void> {
  const prompt = deferred;
  if (!prompt) return;
  await prompt.prompt();
  if ((await prompt.userChoice).outcome === "accepted") deferred = null;
  emit();
}
