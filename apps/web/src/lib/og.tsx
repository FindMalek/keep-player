import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";

/** Share images (Open Graph, Twitter): the site's black and white, the brand mark, a big title. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

const font = (name: string) => readFile(new URL(`../../assets/fonts/${name}`, import.meta.url));

// The bundled fonts are latin only: key symbols in a title or description are spelled out instead.
const KEYS: Record<string, string> = { "⌘": "cmd ", "⇧": "shift ", "⌥": "option ", "⌃": "ctrl ", "↵": "enter", "←": "left", "→": "right" };
const plain = (text?: string) => text?.replace(/[⌘⇧⌥⌃↵←→]/g, (key) => KEYS[key] ?? "").replace(/ {2,}/g, " ");

export async function ogImage(input: { eyebrow: string; title: string; subtitle?: string }) {
  const title = plain(input.title) ?? "";
  const subtitle = plain(input.subtitle);
  const { eyebrow } = input;
  const [regular, medium, mono] = await Promise.all([
    font("ibm-plex-sans-latin-400-normal.woff"),
    font("ibm-plex-sans-latin-500-normal.woff"),
    font("jetbrains-mono-latin-400-normal.woff"),
  ]);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#101010",
        color: "#ebebeb",
        fontFamily: "Plex",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "JetBrains", fontSize: 30 }}>
          <div style={{ width: 22, height: 22, background: "#ebebeb" }} />
          lodesong
        </div>
        {/* The notch island, as on the landing page. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: 260,
            height: 52,
            padding: "0 18px",
            background: "#000",
            border: "1px solid #2a2a2a",
            borderRadius: 26,
          }}
        >
          <div style={{ width: 28, height: 28, backgroundImage: "radial-gradient(circle, #ffffff 0%, #8a8a8a 35%, #1a1a1a 70%)" }} />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 22 }}>
            {[0.55, 1, 0.7, 0.85].map((height) => (
              <div key={height} style={{ width: 5, height: `${height * 100}%`, background: "#ebebeb", borderRadius: 3 }} />
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontFamily: "JetBrains", fontSize: 26, color: "#8f8f8f" }}>{eyebrow}</div>
        <div style={{ fontSize: title.length > 40 ? 64 : 84, fontWeight: 500, lineHeight: 1.05, letterSpacing: -2, maxWidth: 1000 }}>
          {title}
        </div>
        {subtitle && <div style={{ fontSize: 30, color: "#a3a3a3", maxWidth: 980, lineHeight: 1.35 }}>{subtitle}</div>}
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: "Plex", data: regular, weight: 400 },
        { name: "Plex", data: medium, weight: 500 },
        { name: "JetBrains", data: mono, weight: 400 },
      ],
    },
  );
}
