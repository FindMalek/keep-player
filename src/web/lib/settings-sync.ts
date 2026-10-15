import { getSetting, type Settings, SYNCED, setSetting, subscribeSettings } from "./settings";
import { HEADERS, onAccountChange } from "./subsonic";
import { getTheme, setTheme, subscribeTheme, type Theme } from "./theme";

/*
 * Your preferences follow you (#53): after sign-in the server's copy wins (set up once, the same everywhere), and
 * every change here is saved back a second later. Device-only settings (mini player, offline storage, output device)
 * never leave this browser.
 */

type Synced = Partial<Pick<Settings, (typeof SYNCED)[number]>> & { theme?: Theme };

let started = false;
let applying = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const unsubscribe: (() => void)[] = [];

function snapshot(): Synced {
  return { ...Object.fromEntries(SYNCED.map((key) => [key, getSetting(key)])), theme: getTheme() };
}

function save(): void {
  if (applying) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    void fetch("/api/settings", {
      method: "PUT",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify(snapshot()),
    }).catch(() => undefined);
  }, 1000);
}

function apply(remote: Synced): void {
  applying = true;
  try {
    for (const key of SYNCED) {
      const value = remote[key];
      if (typeof value === "boolean" && value !== getSetting(key)) setSetting(key, value);
    }
    if ((remote.theme === "system" || remote.theme === "dark" || remote.theme === "light") && remote.theme !== getTheme())
      setTheme(remote.theme);
  } finally {
    applying = false;
  }
}

export async function startSettingsSync(): Promise<void> {
  if (started) return;
  started = true;
  const response = await fetch("/api/settings", { headers: HEADERS }).catch(() => null);
  const remote = response?.ok ? ((await response.json()) as { settings: Synced | null }).settings : null;
  // First browser for this account: its setup becomes the shared one.
  if (remote) apply(remote);
  else save();
  unsubscribe.push(subscribeSettings(save), subscribeTheme(save));
}

onAccountChange(() => {
  started = false;
  clearTimeout(timer);
  for (const stop of unsubscribe.splice(0)) stop();
});
