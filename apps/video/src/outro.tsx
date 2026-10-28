import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Ambient } from "./ambient";
import { BG, clamp, EASE_OUT, FG, FPS, MONO, MUTED, SANS, useBox } from "./theme";

/** One card: the mark, what it is, where to get it. */
export function Outro({ durationInFrames, credit }: { durationInFrames: number; credit?: string }) {
  const box = useBox();
  const s = box.portrait ? 0.62 : 1;
  const frame = useCurrentFrame();
  const rise = (at: number) => EASE_OUT(interpolate(frame / FPS, [at, at + 0.6], [0, 1], clamp));
  const fade = interpolate(frame, [durationInFrames - 36, durationInFrames - 2], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center", opacity: fade }}>
      <Ambient hues={[18, 285]} level={0.8} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 40 * s,
          opacity: rise(0.1),
          transform: `translateY(${(1 - rise(0.1)) * 24}px)`,
        }}
      >
        <span style={{ width: 96 * s, height: 96 * s, background: FG }} />
        <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 130 * s, letterSpacing: -5, color: FG }}>keep music</span>
      </div>
      <div
        style={{
          marginTop: 46 * s,
          fontFamily: SANS,
          fontSize: 46 * (box.portrait ? 0.8 : 1),
          letterSpacing: -1,
          color: FG,
          opacity: rise(0.7),
          transform: `translateY(${(1 - rise(0.7)) * 18}px)`,
        }}
      >
        Free. Open source. Self-hosted.
      </div>
      <div style={{ marginTop: 22, fontFamily: MONO, fontSize: 32 * (box.portrait ? 0.78 : 1), color: MUTED, opacity: rise(1.2) }}>
        github.com/FindMalek/keep-player
      </div>
      {credit && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 50,
            textAlign: "center",
            fontFamily: MONO,
            fontSize: 20 * (box.portrait ? 0.9 : 1),
            color: MUTED,
            opacity: rise(1.6) * 0.8,
          }}
        >
          {credit}
        </div>
      )}
    </AbsoluteFill>
  );
}
