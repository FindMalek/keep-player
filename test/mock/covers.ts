export type Motif = "sun" | "grid" | "bauhaus" | "waves" | "rings" | "stripes" | "eclipse";

export interface CoverSpec {
  title: string;
  artist: string;
  motif: Motif;
  /** Two hues, 0 to 360, that set the palette. */
  hues: [number, number];
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h % 360},${s}%,${l}%,${a})`;

function art(spec: CoverSpec): string {
  const [a, b] = spec.hues;
  switch (spec.motif) {
    case "sun": {
      const stripes = Array.from(
        { length: 7 },
        (_, i) => `<rect x="0" y="${232 + i * 13}" width="400" height="${2 + i * 1.6}" fill="${hsl(b, 60, 8)}"/>`,
      ).join("");
      return `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(b, 70, 14)}"/><stop offset=".62" stop-color="${hsl(a, 85, 55)}"/><stop offset="1" stop-color="${hsl(a - 20, 90, 70)}"/></linearGradient></defs><rect width="400" height="400" fill="url(#s)"/><circle cx="200" cy="232" r="96" fill="${hsl(a + 25, 95, 78)}"/>${stripes}<rect y="232" width="400" height="168" fill="${hsl(b, 55, 7)}"/><rect y="232" width="400" height="2" fill="${hsl(a, 90, 70)}"/>`;
    }
    case "grid": {
      const lines = Array.from(
        { length: 9 },
        (_, i) => `<line x1="200" y1="228" x2="${-160 + i * 90}" y2="400" stroke="${hsl(a, 90, 62, 0.8)}" stroke-width="1.4"/>`,
      ).join("");
      const rows = Array.from(
        { length: 6 },
        (_, i) =>
          `<line x1="0" x2="400" y1="${240 + i * i * 6 + i * 8}" y2="${240 + i * i * 6 + i * 8}" stroke="${hsl(a, 90, 62, 0.7)}" stroke-width="1.4"/>`,
      ).join("");
      return `<rect width="400" height="400" fill="${hsl(b, 70, 9)}"/><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(a + 30, 100, 65)}"/><stop offset="1" stop-color="${hsl(a - 30, 100, 55)}"/></linearGradient></defs><circle cx="200" cy="170" r="78" fill="url(#g)"/><rect y="228" width="400" height="172" fill="${hsl(b, 70, 7)}"/>${lines}${rows}`;
    }
    case "bauhaus":
      return `<rect width="400" height="400" fill="${hsl(a, 55, 88)}"/><circle cx="130" cy="150" r="92" fill="${hsl(b, 80, 52)}"/><path d="M200 400 A110 110 0 0 1 420 400 Z" fill="${hsl(a, 85, 48)}"/><rect x="40" y="250" width="130" height="130" fill="${hsl(b + 160, 40, 14)}"/><rect x="238" y="70" width="26" height="170" fill="${hsl(b + 160, 40, 14)}"/><circle cx="300" cy="300" r="34" fill="${hsl(a + 40, 90, 60)}"/>`;
    case "waves": {
      const paths = Array.from({ length: 8 }, (_, i) => {
        const y = 110 + i * 38;
        return `<path d="M0 ${y} C 80 ${y - 46}, 140 ${y + 46}, 210 ${y} S 340 ${y - 40}, 400 ${y} V 400 H 0 Z" fill="${hsl(a + i * 9, 80, 60 - i * 5, 0.55)}"/>`;
      }).join("");
      return `<defs><linearGradient id="w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(b, 75, 20)}"/><stop offset="1" stop-color="${hsl(a, 80, 38)}"/></linearGradient></defs><rect width="400" height="400" fill="url(#w)"/>${paths}`;
    }
    case "rings": {
      const rings = Array.from(
        { length: 9 },
        (_, i) =>
          `<circle cx="${200 + i * 4}" cy="${180 - i * 3}" r="${150 - i * 16}" fill="none" stroke="${hsl(a + i * 14, 85, 66, 0.9)}" stroke-width="${3 + i * 0.4}"/>`,
      ).join("");
      return `<rect width="400" height="400" fill="${hsl(b, 65, 10)}"/>${rings}<circle cx="236" cy="156" r="26" fill="${hsl(a + 40, 95, 72)}"/>`;
    }
    case "stripes": {
      const bars = Array.from(
        { length: 12 },
        (_, i) => `<rect x="${i * 34}" y="0" width="34" height="400" fill="${hsl(a + i * 8, 80, 30 + i * 3.5)}"/>`,
      ).join("");
      return `${bars}<rect y="120" width="400" height="160" fill="${hsl(b, 70, 10, 0.78)}"/>`;
    }
    case "eclipse":
      return `<rect width="400" height="400" fill="${hsl(b, 55, 6)}"/><defs><radialGradient id="e" cx=".5" cy=".5" r=".5"><stop offset=".78" stop-color="${hsl(a, 95, 70, 0)}"/><stop offset=".9" stop-color="${hsl(a, 95, 66, 0.9)}"/><stop offset="1" stop-color="${hsl(a, 95, 60, 0)}"/></radialGradient></defs><circle cx="200" cy="180" r="168" fill="url(#e)"/><circle cx="200" cy="180" r="118" fill="${hsl(b, 60, 4)}"/>`;
  }
}

const xml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** An album cover as SVG: a motif and palette per album, with the title and artist set on it like real sleeve art. */
export function coverSvg(spec: CoverSpec): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${art(spec)}<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".62"/></linearGradient></defs><rect y="270" width="400" height="130" fill="url(#fade)"/><text x="26" y="350" font-family="Helvetica Neue, Arial, sans-serif" font-weight="800" font-size="34" letter-spacing="-1" fill="white" opacity=".96">${xml(spec.title.toUpperCase())}</text><text x="27" y="376" font-family="Helvetica Neue, Arial, sans-serif" font-weight="500" font-size="15" letter-spacing="3" fill="white" opacity=".72">${xml(spec.artist.toUpperCase())}</text></svg>`;
}
