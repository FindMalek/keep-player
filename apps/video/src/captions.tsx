import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { clamp, EASE_OUT, FG, FPS, MONO, MUTED, SANS, useBox } from "./theme";

export interface Line {
  text: string;
  sub?: string;
  /** Seconds into the segment. */
  from: number;
  to: number;
}

/** One caption line at a time under the frame: it rises in, holds, and lifts out. */
export function Captions({ lines }: { lines: Line[] }) {
  const box = useBox();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {lines.map((line) => {
        const enter = EASE_OUT(interpolate(t, [line.from, line.from + 0.45], [0, 1], clamp));
        const leave = interpolate(t, [line.to - 0.3, line.to], [0, 1], clamp);
        if (t < line.from || t > line.to) return null;
        return (
          <div
            key={line.text}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: box.captionY,
              padding: box.portrait ? "0 50px" : 0,
              textAlign: "center",
              opacity: enter * (1 - leave),
              transform: `translateY(${(1 - enter) * 14 - leave * 8}px)`,
            }}
          >
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 46 * box.k, lineHeight: 1.1, letterSpacing: -1.2, color: FG }}>
              {line.text}
            </div>
            {line.sub && <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 22 * box.k, color: MUTED }}>{line.sub}</div>}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
