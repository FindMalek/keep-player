import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export function Title({ text }: { text: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 96 }}>
      <div
        style={{
          color: "white",
          font: "700 72px/1 system-ui, sans-serif",
          letterSpacing: -2,
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px)`,
          textShadow: "0 4px 32px rgba(0,0,0,.6)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}
