/**
 * What to do when the browser can't offer the one-click install. Pure, so it's testable: the user agent, and
 * whether this is Arc (it looks like Chrome but can't install web apps; it sets its own CSS variables on the page).
 */
export function installHelp(userAgent: string, arc: boolean): string {
  if (arc) return "arc can't install web apps · open this page in chrome or safari";
  if (/iPhone|iPad/.test(userAgent)) return "share → add to home screen";
  if (/Firefox\//.test(userAgent)) return "firefox can't install web apps · use chrome, edge or safari";
  if (/Edg\//.test(userAgent)) return "edge: ⋯ menu → apps → install this site as an app";
  if (/Chrome\//.test(userAgent)) return "chrome: ⋮ menu → cast, save and share → install page as app";
  if (/Safari\//.test(userAgent)) return "safari: file → add to dock";
  return "from your browser's menu";
}

/** Arc paints its theme into CSS variables on every page; no other browser does. */
export function isArc(): boolean {
  return getComputedStyle(document.documentElement).getPropertyValue("--arc-palette-title").trim() !== "";
}
