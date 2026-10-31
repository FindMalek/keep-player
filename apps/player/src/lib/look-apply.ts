import { applyLookCss, storedLookCss, storeLookCss } from "./look";
import { DEFAULT_LOOK, decodeLook, encodeLook, type Look, lookCss } from "./look-code";
import { getSetting, setSetting } from "./settings";

export function savedLook(): Look {
  return decodeLook(getSetting("look")) ?? DEFAULT_LOOK;
}

/** Shows a look without keeping it. */
export function previewLook(look: Look): void {
  applyLookCss(lookCss(look));
}

export function revertLook(): void {
  applyLookCss(storedLookCss());
}

/** Keeps a look: applied now, stored on this device, synced through the setting. */
export function saveLook(look: Look): void {
  const css = lookCss(look);
  storeLookCss(css);
  applyLookCss(css);
  setSetting("look", css ? encodeLook(look) : "");
}

/** After the server's copy arrived: make this device match it. */
export function syncLook(): void {
  const css = lookCss(savedLook());
  storeLookCss(css);
  applyLookCss(css);
}
