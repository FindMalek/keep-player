export const TONES = ["neutral", "warm", "cool"] as const;
export const ACCENTS = ["ink", "graphite", "steel"] as const;
export const RADII = [0, 2, 4, 8] as const;
export const FONTS = ["plex", "mono"] as const;

export interface Look {
  tone: (typeof TONES)[number];
  accent: (typeof ACCENTS)[number];
  radius: (typeof RADII)[number];
  font: (typeof FONTS)[number];
}

export const DEFAULT_LOOK: Look = { tone: "neutral", accent: "ink", radius: 0, font: "plex" };

export const PRESETS: { name: string; look: Look }[] = [
  { name: "lodesong", look: DEFAULT_LOOK },
  { name: "paper", look: { tone: "warm", accent: "graphite", radius: 2, font: "plex" } },
  { name: "slate", look: { tone: "cool", accent: "steel", radius: 4, font: "plex" } },
  { name: "terminal", look: { tone: "neutral", accent: "graphite", radius: 0, font: "mono" } },
  { name: "soft", look: { tone: "warm", accent: "steel", radius: 8, font: "plex" } },
];

const PREFIX = "lode1";

export function encodeLook(look: Look): string {
  return [PREFIX, look.tone, look.accent, look.radius, look.font].join(".");
}

function pick<T extends string | number>(options: readonly T[], value: string): T | undefined {
  return options.find((option) => String(option) === value);
}

/** Null for anything that isn't a code this version wrote. */
export function decodeLook(code: string): Look | null {
  const [prefix, tone, accent, radius, font, ...rest] = code.trim().split(".");
  if (prefix !== PREFIX || rest.length || !tone || !accent || !radius || !font) return null;
  const look = { tone: pick(TONES, tone), accent: pick(ACCENTS, accent), radius: pick(RADII, radius), font: pick(FONTS, font) };
  return look.tone && look.accent && look.radius !== undefined && look.font ? (look as Look) : null;
}

const TINT = { neutral: [0, 0], warm: [75, 0.01], cool: [255, 0.012] } as const;
/** Lightness of the solid accent (buttons, selected rows) and of the text on it, in light and dark; ink is the brand's own. */
const SOLID = {
  ink: null,
  graphite: { light: [0.36, 0.944], dark: [0.86, 0.178] },
  steel: { light: [0.46, 0.97], dark: [0.8, 0.178] },
} as const;

interface Scheme {
  background: number;
  card: number;
  secondary: number;
  border: number;
  ring: number;
  muted: number;
  foreground: number;
}

const LIGHT: Scheme = { background: 0.944, card: 0.97, secondary: 0.918, border: 0.837, ring: 0.7, muted: 0.447, foreground: 0.178 };
const DARK: Scheme = { background: 0.178, card: 0.21, secondary: 0.23, border: 0.269, ring: 0.371, muted: 0.668, foreground: 0.944 };

function tokens(look: Look, scheme: Scheme, dark: boolean): string {
  const [hue, chroma] = TINT[look.tone];
  const tone = (lightness: number): string => `oklch(${lightness} ${chroma} ${hue})`;
  const solid = SOLID[look.accent]?.[dark ? "dark" : "light"];
  const primary = tone(solid ? solid[0] : scheme.foreground);
  const onPrimary = tone(solid ? solid[1] : scheme.background);
  const pairs: [string, string][] = [
    ["background", tone(scheme.background)],
    ["foreground", tone(scheme.foreground)],
    ["card", tone(scheme.card)],
    ["card-foreground", tone(scheme.foreground)],
    ["popover", tone(scheme.card)],
    ["popover-foreground", tone(scheme.foreground)],
    ["primary", primary],
    ["primary-foreground", onPrimary],
    ["secondary", tone(scheme.secondary)],
    ["secondary-foreground", tone(scheme.foreground)],
    ["muted", tone(scheme.secondary)],
    ["muted-foreground", tone(scheme.muted)],
    ["accent", tone(scheme.secondary)],
    ["accent-foreground", tone(scheme.foreground)],
    ["border", tone(scheme.border)],
    ["input", tone(scheme.border)],
    ["ring", tone(scheme.ring)],
    ["sidebar", tone(scheme.background)],
    ["sidebar-foreground", tone(scheme.foreground)],
    ["sidebar-primary", primary],
    ["sidebar-primary-foreground", onPrimary],
    ["sidebar-accent", tone(scheme.secondary)],
    ["sidebar-accent-foreground", tone(scheme.foreground)],
    ["sidebar-border", tone(scheme.border)],
    ["sidebar-ring", tone(scheme.ring)],
  ];
  return pairs.map(([name, value]) => `--${name}:${value}`).join(";");
}

/** The whole look as one stylesheet; empty for the default, so the brand stays untouched. */
export function lookCss(look: Look): string {
  if (encodeLook(look) === encodeLook(DEFAULT_LOOK)) return "";
  const font = look.font === "mono" ? 'html,body{font-family:"JetBrains Mono Variable",ui-monospace,"SF Mono",Menlo,monospace}' : "";
  return `:root{${tokens(look, LIGHT, false)};--look-radius:${look.radius}px}.dark{${tokens(look, DARK, true)}}${font}`;
}
