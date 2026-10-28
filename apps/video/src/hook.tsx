import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Ambient } from "./ambient";
import { BG, clamp, EASE_OUT, FG, FPS, MUTED, SANS, useBox } from "./theme";

// Three lines, one every three beats, each landing with a pulse in the score.
const LINES = [
  { text: "Your library.", word: "library.", hue: 28, at: 1.0 },
  { text: "Your server.", word: "server.", hue: 215, at: 2.5 },
  { text: "Your rules.", word: "rules.", hue: 330, at: 4.0 },
];

/** The tension before the reveal: dark, slow, three lines. Everything fades to black just before the impact. */
/** `length` is how many seconds it runs; the line timings below are for the full 6 s and scale to fit. */
export function Tension({ length = 6 }: { length?: number }) {
  const box = useBox();
  const frame = useCurrentFrame();
  const t = (frame / FPS) * (6 / length);
  const out = interpolate(t, [5.2, 5.9], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", paddingLeft: box.portrait ? 70 : 190 }}>
      <Ambient hues={[18, 330]} level={interpolate(t, [0, 5.4], [0, 1.1], clamp) * (1 - out)} />
      <div
        style={{
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: box.portrait ? 128 : 170,
          lineHeight: 1.06,
          letterSpacing: -7,
          opacity: 1 - out,
          transform: `scale(${1 + t * 0.006})`,
          transformOrigin: "0 50%",
        }}
      >
        {LINES.map((line, index) => {
          const p = EASE_OUT(interpolate(t, [line.at, line.at + 0.9], [0, 1], clamp));
          const next = LINES[index + 1];
          const dim = next ? interpolate(t, [next.at, next.at + 0.6], [0, 1], clamp) : 0;
          return (
            <div
              key={line.text}
              style={{
                color: dim > 0 ? MUTED : FG,
                opacity: p * (1 - dim * 0.55),
                transform: `translateY(${(1 - p) * 40}px)`,
                filter: `blur(${(1 - p) * 14}px)`,
                letterSpacing: -7 + (1 - p) * 10,
              }}
            >
              {line.text.slice(0, line.text.length - line.word.length)}
              <span style={{ color: `hsl(${line.hue},90%,70%)`, textShadow: `0 0 60px hsla(${line.hue},90%,60%,0.5)` }}>{line.word}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
