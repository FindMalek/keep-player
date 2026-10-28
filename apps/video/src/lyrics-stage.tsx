import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Ambient } from "./ambient";
import { BG, clamp, EASE_OUT, FG, FPS, MONO, MUTED, SANS, useBox } from "./theme";

const LINES = [
  "Radio low and your window down",
  "We said we'd drive until the map runs out",
  "Now the city's just a hum behind us",
  "Chase the afterglow",
];
// One line every 1.5 s (three beats at 120 bpm).
const STEP = 1.5;
const BARS = 56;

/** The `y` key, full stage: cover with a ring that breathes on the beat, and the lyrics large, one line lit at a time. */
export function LyricsStage() {
  const box = useBox();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const beat = t / 0.5;
  const pulse = Math.exp(-(beat % 1) * 5);
  const active = Math.min(LINES.length - 1, Math.floor(t / STEP));
  const enter = EASE_OUT(interpolate(t, [0, 0.7], [0, 1], clamp));
  const size = box.portrait ? 460 : 520;
  const ring = size / 2 + 70;
  return (
    <AbsoluteFill
      style={{
        background: BG,
        flexDirection: box.portrait ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: box.portrait ? 70 : 110,
      }}
    >
      <Ambient hues={[18, 285]} level={1.5 + pulse * 0.5} />
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          transform: `scale(${(0.88 + enter * 0.12) * (1 + pulse * 0.015)})`,
          opacity: enter,
        }}
      >
        {Array.from({ length: BARS }, (_, i) => {
          const angle = (i / BARS) * Math.PI * 2;
          const h = 14 + (Math.abs(Math.sin(i * 1.7 + t * 5)) * 0.6 + pulse * 0.5) * 46;
          return (
            <div
              key={`bar-${angle}`}
              style={{
                position: "absolute",
                left: size / 2 - 2,
                top: size / 2 - h / 2,
                width: 4,
                height: h,
                borderRadius: 2,
                background: `hsl(${18 + (i / BARS) * 270},85%,65%)`,
                opacity: 0.85,
                transform: `rotate(${angle}rad) translateY(${-ring}px) rotate(0rad)`,
                transformOrigin: "50% 50%",
              }}
            />
          );
        })}
        <Img
          src={staticFile("shots/cover.svg")}
          style={{ width: size, height: size, borderRadius: 18, boxShadow: "0 40px 120px rgba(0,0,0,0.6)" }}
        />
      </div>
      <div
        style={{
          width: box.portrait ? "86%" : 760,
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: box.portrait ? 64 : 58,
          lineHeight: 1.2,
          letterSpacing: -2,
        }}
      >
        {LINES.map((line, i) => {
          const dist = i - active;
          const arrived = EASE_OUT(interpolate(t - i * STEP, [-0.4, 0.3], [0, 1], clamp));
          const lit = dist === 0 ? 1 : 0;
          return (
            <div
              key={line}
              style={{
                color: lit ? FG : MUTED,
                opacity: (lit ? 1 : dist < 0 ? 0.22 : 0.42) * (0.3 + 0.7 * arrived),
                transform: `translateY(${(1 - arrived) * 24}px) scale(${lit ? 1 : 0.94})`,
                transformOrigin: "0 50%",
                filter: `blur(${lit ? 0 : 2}px)`,
                marginBottom: 26,
                textShadow: lit ? "0 0 50px hsla(18,90%,60%,0.45)" : "none",
              }}
            >
              {line}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 60, top: 50, fontFamily: MONO, fontSize: 22, color: MUTED, letterSpacing: 2 }}>
        <span style={{ border: `1px solid ${MUTED}`, borderRadius: 6, padding: "4px 12px", color: FG, marginRight: 14 }}>y</span>
        synced lyrics
      </div>
    </AbsoluteFill>
  );
}
