// The saved look's CSS, applied before the first render. The lazy theme builder (look-code.ts) generates it.

const CSS_KEY = "keep-player:look-css";
const style = document.createElement("style");
style.id = "look";
document.head.append(style);

export function applyLookCss(css: string): void {
  style.textContent = css;
}

export function storedLookCss(): string {
  try {
    return localStorage.getItem(CSS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storeLookCss(css: string): void {
  try {
    if (css) localStorage.setItem(CSS_KEY, css);
    else localStorage.removeItem(CSS_KEY);
  } catch {
    // Applies for this session only.
  }
}

applyLookCss(storedLookCss());
