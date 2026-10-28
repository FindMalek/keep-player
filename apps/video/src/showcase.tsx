import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Ambient } from "./ambient";
import { Captions } from "./captions";
import { Notch } from "./notch";
import { BG, clamp, EASE_OUT, FPS, LINE, sec, useBox } from "./theme";

interface Shot {
  image: string;
  text: string;
  /** Where the camera starts and ends, in screenshot pixels (1920x1080), with the zoom at each. */
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
}

const SHOTS: Shot[] = [
  { image: "home", text: "A mix for every mood.", from: { x: 760, y: 230, z: 1.7 }, to: { x: 1180, y: 230, z: 1.9 } },
  { image: "stats", text: "Your listening, counted.", from: { x: 760, y: 340, z: 1.5 }, to: { x: 1000, y: 330, z: 1.7 } },
];

export const SHOT_LENGTH = 1.5;
const NOTCH_LENGTH = 3;
export const SHOWCASE_LENGTH = SHOT_LENGTH * SHOTS.length + NOTCH_LENGTH;

function Still({ shot }: { shot: Shot }) {
  const FRAME = useBox();
  const frame = useCurrentFrame();
  const p = EASE_OUT(interpolate(frame / FPS, [0, SHOT_LENGTH], [0, 1], clamp));
  const x = shot.from.x + (shot.to.x - shot.from.x) * p;
  const y = shot.from.y + (shot.to.y - shot.from.y) * p;
  const z = shot.from.z + (shot.to.z - shot.from.z) * p;
  const scale = Math.max(FRAME.w / 1920, FRAME.h / 1080) * (FRAME.portrait ? Math.max(1, z * 0.66) : z);
  const tx = Math.min(0, Math.max(FRAME.w - 1920 * scale, FRAME.w / 2 - x * scale));
  const ty = Math.min(0, Math.max(FRAME.h - 1080 * scale, FRAME.h / 2 - y * scale));
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Ambient hues={shot.image === "home" ? [215, 285] : [285, 200]} />
      <div
        style={{
          position: "absolute",
          left: FRAME.x,
          top: FRAME.y,
          width: FRAME.w,
          height: FRAME.h,
          borderRadius: 14,
          overflow: "hidden",
          border: `1px solid ${LINE}`,
          boxShadow: "0 50px 140px rgba(0,0,0,.65)",
          background: "#0e0f10",
        }}
      >
        <Img
          src={staticFile(`shots/${shot.image}.jpg`)}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1920,
            height: 1080,
            transformOrigin: "0 0",
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          }}
        />
      </div>
      <Captions lines={[{ text: shot.text, from: 0.05, to: SHOT_LENGTH }]} />
    </AbsoluteFill>
  );
}

/** Two screens of the real app, one every three beats with a slow push (stills are 4K, so the zoom stays sharp), then the macOS notch. */
export function Showcase() {
  return (
    <AbsoluteFill>
      {SHOTS.map((shot, index) => (
        <Sequence key={shot.image} from={sec(index * SHOT_LENGTH)} durationInFrames={sec(SHOT_LENGTH)}>
          <Still shot={shot} />
        </Sequence>
      ))}
      <Sequence from={sec(SHOTS.length * SHOT_LENGTH)} durationInFrames={sec(NOTCH_LENGTH)}>
        <Notch />
      </Sequence>
    </AbsoluteFill>
  );
}
