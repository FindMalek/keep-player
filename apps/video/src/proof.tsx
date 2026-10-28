import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Captions } from "./captions";
import { BG, clamp, FG, FPS, LINE, MONO, MUTED, useBox } from "./theme";

const COMMAND = "docker compose up -d";
const OUTPUT = ["✔ pulled keep-player", "✔ linked to your navidrome", "✔ listening on :8080"];

/** The proof beat: one command and it is up. */
export function Proof() {
  const FRAME = useBox();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const typed = Math.min(COMMAND.length, Math.max(0, Math.floor((t - 0.3) / 0.05)));
  const intro = interpolate(frame, [0, 24], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: BG }}>
      <AbsoluteFill style={{ background: "radial-gradient(1300px 760px at 50% 38%, rgba(255,255,255,0.055), transparent 70%)" }} />
      <div
        style={{
          position: "absolute",
          left: FRAME.x,
          top: FRAME.y,
          width: FRAME.w,
          height: FRAME.h,
          borderRadius: 14,
          border: `1px solid ${LINE}`,
          background: "#0e0f10",
          boxShadow: "0 50px 140px rgba(0,0,0,.65)",
          opacity: intro,
          transform: `scale(${0.97 + intro * 0.03})`,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", gap: 10, padding: "20px 24px", borderBottom: `1px solid ${LINE}` }}>
          {["#3a3d42", "#3a3d42", "#3a3d42"].map((color, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: three identical dots
            <span key={index} style={{ width: 14, height: 14, borderRadius: 99, background: color }} />
          ))}
        </div>
        <div
          style={{
            padding: FRAME.portrait ? "70px 50px" : "90px 110px",
            fontFamily: MONO,
            fontSize: FRAME.portrait ? 40 : 46,
            lineHeight: 1.8,
            color: FG,
          }}
        >
          <div>
            <span style={{ color: MUTED }}>$ </span>
            {COMMAND.slice(0, typed)}
            <span
              style={{
                display: "inline-block",
                width: 24,
                height: 50,
                marginLeft: 4,
                background: FG,
                verticalAlign: "text-bottom",
                opacity: Math.floor(t * 2) % 2 === 0 ? 1 : 0.2,
              }}
            />
          </div>
          {OUTPUT.map((line, index) => (
            <div key={line} style={{ color: "#7ee787", opacity: t >= 1.5 + index * 0.4 ? 1 : 0 }}>
              {line}
            </div>
          ))}
        </div>
      </div>
      <Captions lines={[{ text: "Runs on your own Navidrome.", sub: "one container · up in two minutes", from: 0.4, to: 3.9 }]} />
    </AbsoluteFill>
  );
}
