import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Ambient } from "./ambient";
import { Captions } from "./captions";
import { BG, clamp, EASE_OUT, FG, FPS, MONO, SANS, useBox } from "./theme";

const SHAPES = {
  compact: { w: 330, h: 38, r: 14 },
  peek: { w: 620, h: 176, r: 34 },
  open: { w: 760, h: 330, r: 40 },
} as const;
const STEPS = [
  { at: 0, shape: "compact" },
  { at: 0.6, shape: "peek" },
  { at: 1.7, shape: "open" },
] as const;

type Shape = { w: number; h: number; r: number };

function shapeAt(t: number): Shape {
  let current: Shape = SHAPES.compact;
  for (let i = 1; i < STEPS.length; i += 1) {
    const from = SHAPES[(STEPS[i - 1] as (typeof STEPS)[number]).shape];
    const step = STEPS[i] as (typeof STEPS)[number];
    const to = SHAPES[step.shape];
    const p = EASE_OUT(interpolate(t, [step.at, step.at + 0.5], [0, 1], clamp));
    if (t >= step.at) current = { w: from.w + (to.w - from.w) * p, h: from.h + (to.h - from.h) * p, r: from.r + (to.r - from.r) * p };
  }
  return current;
}

function Bars({ size }: { size: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: size * 0.2, height: size }}>
      {[0, 1, 2, 3].map((index) => (
        <span
          key={index}
          style={{
            width: size * 0.2,
            height: size * (0.25 + 0.5 * Math.abs(Math.sin(frame / (5 + index * 1.7) + index))),
            background: FG,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

const LYRICS = ["Streetlights stretch across the dashboard", "Radio low and your window down", "We said we'd drive until the map runs out"];

/** The macOS notch island, built here as a mockup: compact beside the camera, a peek with the song, then fully open on its lyrics. */
export function Notch() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const box = useBox();
  const shape = shapeAt(t);
  const scale = box.portrait ? 1.28 : 1.75;
  const compact = interpolate(t, [0.45, 0.6], [1, 0], clamp);
  const peek = interpolate(t, [0.55, 0.9, 1.6, 1.8], [0, 1, 1, 0], clamp);
  const open = interpolate(t, [1.7, 2.1], [0, 1], clamp);
  const line = Math.min(2, Math.floor(Math.max(0, t - 2.0) / 0.5));
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Ambient hues={[18, 285]} level={1.5} />
      <Img
        src={staticFile("shots/home.jpg")}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.55,
          filter: "blur(26px) saturate(1.7) brightness(1.1)",
          transform: "scale(1.15)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 36 * scale,
          background: "rgba(10,10,10,.55)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,.06)",
          display: "flex",
          alignItems: "center",
          padding: `0 ${26 * scale}px`,
          gap: 22 * scale,
          fontFamily: SANS,
          fontSize: 15 * scale,
          color: "rgba(255,255,255,.75)",
        }}
      >
        <span style={{ fontWeight: 700, color: FG }}>keep music</span>
        <span>File</span>
        <span>Edit</span>
        <span>View</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO }}>Tue 10:42</span>
      </div>
      <div style={{ position: "absolute", left: "50%", top: 0, transform: `translateX(-50%) scale(${scale})`, transformOrigin: "50% 0" }}>
        <div
          style={{
            width: shape.w,
            height: shape.h,
            background: "#000",
            borderRadius: `0 0 ${shape.r}px ${shape.r}px`,
            overflow: "hidden",
            position: "relative",
            boxShadow: "0 30px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.1)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: compact,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 14px",
            }}
          >
            <Img src={staticFile("shots/cover.svg")} style={{ width: 26, height: 26, borderRadius: 6 }} />
            <Bars size={18} />
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: peek,
              padding: "42px 22px 0",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <Img src={staticFile("shots/cover.svg")} style={{ width: 64, height: 64, borderRadius: 12 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 21, color: FG }}>Afterglow</div>
                <div style={{ fontFamily: SANS, fontSize: 16, color: "rgba(255,255,255,.55)" }}>Halcyon Drive</div>
              </div>
              <Bars size={22} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: MONO, fontSize: 12, color: "rgba(255,255,255,.5)" }}>
              <span>1:42</span>
              <div style={{ flex: 1, height: 4, borderRadius: 4, background: "rgba(255,255,255,.18)" }}>
                <div style={{ width: `${34 + t * 4}%`, height: "100%", borderRadius: 4, background: FG }} />
              </div>
              <span>-2:05</span>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 30, color: FG, fontSize: 20 }}>
              <span>⏮</span>
              <span>⏸</span>
              <span>⏭</span>
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: open,
              padding: "44px 26px 0",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", gap: 8, fontFamily: SANS, fontSize: 14, color: "rgba(255,255,255,.55)" }}>
              {["Now Playing", "Lyrics", "Queue"].map((tab) => (
                <span
                  key={tab}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    background: tab === "Lyrics" ? "rgba(255,255,255,.16)" : "transparent",
                    color: tab === "Lyrics" ? FG : undefined,
                  }}
                >
                  {tab}
                </span>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: -0.6,
              }}
            >
              {LYRICS.map((text, index) => (
                <span key={text} style={{ color: FG, opacity: index === line ? 1 : 0.3 }}>
                  {text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Captions lines={[{ text: "It lives in your notch.", sub: "the macOS app", from: 0.3, to: 3 }]} />
    </AbsoluteFill>
  );
}
