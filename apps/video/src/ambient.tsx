import { AbsoluteFill, useCurrentFrame } from "remotion";
import { FPS } from "./theme";

/** Colour in the room: two slow pools of light in the album's hues behind everything, so the dark has depth and warmth. */
export function Ambient({ hues = [18, 285], level = 1 }: { hues?: [number, number]; level?: number }) {
  const t = useCurrentFrame() / FPS;
  const a = 0.3 * level;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(900px 620px at ${22 + Math.sin(t / 3) * 6}% ${30 + Math.cos(t / 4) * 5}%, hsla(${hues[0]},85%,55%,${a}), transparent 70%), radial-gradient(1000px 700px at ${80 + Math.cos(t / 3.5) * 6}% ${72 + Math.sin(t / 4.5) * 6}%, hsla(${hues[1]},75%,45%,${a}), transparent 70%), radial-gradient(1300px 760px at 50% 40%, rgba(255,255,255,0.04), transparent 70%)`,
      }}
    />
  );
}
