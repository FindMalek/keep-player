import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Captions, type Line } from "./captions";
import { Tension } from "./hook";
import { LyricsStage } from "./lyrics-stage";
import { Outro } from "./outro";
import { Proof } from "./proof";
import { Reveal } from "./reveal";
import { type Callout, EVENTS, type Flight, Session, type Spot, type View } from "./session";
import { Sfx } from "./sfx";
import { SHOWCASE_LENGTH, Showcase } from "./showcase";
import { BG, EASE_OUT, FG, FPS, MONO, MUTED, SANS, sec } from "./theme";

interface Segment {
  /** Where it sits in the film (seconds), and how long it runs. Every cut is on a half-second: a beat at 120 bpm. */
  at: number;
  length: number;
  /** Seconds into the recording where it starts, and the playback rate that lines its key actions up with beats. */
  from: number;
  rate?: number;
  cam: View[];
  captions: Line[];
  enter?: boolean;
  spot?: Spot;
  callouts?: Callout[];
  flight?: Flight;
  glow?: [number, number];
}

// The recorded session cut to the score (see CASE-STUDY.md). Camera times are seconds into the recording.
const SEGMENTS: Segment[] = [
  {
    // Search and play: the click on the search bar lands on beat 12.0, the click on the song on 16.0.
    at: 10,
    glow: [215, 285],
    callouts: [{ x: 800, y: 395, r: 70, label: "instant results", dx: 320, dy: -110, from: 4.5, to: 5.8 }],
    flight: { from: { x: 655, y: 494, size: 30 }, to: { x: 35, y: 1048, size: 44 }, at: 6.75, length: 0.8 },
    length: 8,
    from: 0.955,
    rate: 0.9574,
    cam: [
      { t: 0.955, x: 960, y: 540, z: 1 },
      { t: 1.7, x: 960, y: 540, z: 1 },
      { t: 2.7, x: 1010, y: 200, z: 1.35 },
      { t: 3.3, x: 1010, y: 200, z: 1.35 },
      { t: 3.9, x: 960, y: 360, z: 1.6 },
      { t: 5.2, x: 960, y: 360, z: 1.6 },
      { t: 6, x: 850, y: 430, z: 1.5 },
      { t: 6.8, x: 850, y: 430, z: 1.5 },
      { t: 8.2, x: 960, y: 540, z: 1 },
      { t: 8.62, x: 960, y: 540, z: 1 },
    ],
    captions: [
      { text: "Your whole library. One keystroke.", from: 0.4, to: 1.9 },
      { text: "Search. Hear it.", sub: "songs · albums · artists · lyrics", from: 3.1, to: 7.6 },
    ],
  },
  {
    // "start radio" lands on 26.0 and the 30-song preview opens.
    at: 24,
    glow: [265, 215],
    callouts: [{ x: 860, y: 150, r: 55, label: "preview first", dx: 280, dy: -70, from: 25.05, to: 25.9 }],
    length: 3.5,
    from: 22.4,
    cam: [
      { t: 22.4, x: 780, y: 430, z: 1.35 },
      { t: 24.5, x: 780, y: 430, z: 1.35 },
      { t: 25.2, x: 960, y: 540, z: 1.25 },
      { t: 25.9, x: 960, y: 540, z: 1.25 },
    ],
    captions: [{ text: "Radio you can preview.", sub: "see every song before it plays", from: 0.5, to: 3.5 }],
  },
  {
    // The two removals land on 27.7 and 29.5.
    at: 27.5,
    glow: [265, 215],
    callouts: [{ x: 1124, y: 333, r: 30, label: "drop any song", dx: 150, dy: -70, from: 28.0, to: 29.6 }],
    length: 2.5,
    from: 27.9,
    cam: [
      { t: 27.9, x: 1100, y: 380, z: 1.55 },
      { t: 30.4, x: 1100, y: 380, z: 1.55 },
    ],
    captions: [{ text: "Drop what you don't want.", from: 0.1, to: 2.5 }],
  },
  {
    // "play radio" lands on 31.0.
    at: 30,
    glow: [18, 285],
    length: 1.3,
    from: 31.71,
    cam: [
      { t: 31.71, x: 1100, y: 800, z: 1.5 },
      { t: 33, x: 1100, y: 800, z: 1.5 },
    ],
    captions: [{ text: "Hit play.", from: 0.1, to: 1.3 }],
  },
  {
    // Cut past the empty page the dialog leaves behind: the queue opens (key press) on 31.5.
    at: 31.3,
    glow: [18, 285],
    length: 1.2,
    from: 33.5,
    cam: [
      { t: 33.5, x: 1500, y: 520, z: 1.3 },
      { t: 34.7, x: 1500, y: 520, z: 1.3 },
    ],
    captions: [{ text: "Radio, running.", from: 0.1, to: 1.2 }],
  },
];

const FADE = 6;
const TENSION = { at: 0, length: 6 };
const REVEAL = { at: 6, length: 4 };
const LYRICS = { at: 18, length: 6 };
const SHOWCASE = { at: 32.5, length: SHOWCASE_LENGTH };
const PROOF = { at: 38.5, length: 4 };
const OUTRO = { at: 42.5, length: 5.5 };
export const TOTAL = sec(OUTRO.at + OUTRO.length);

function Sounds() {
  let keyIndex = 0;
  const sounds = SEGMENTS.flatMap((segment) => {
    const rate = segment.rate ?? 1;
    return EVENTS.flatMap((event) => {
      if (event.kind === "move") return [];
      if (event.t < segment.from || event.t >= segment.from + segment.length * rate) return [];
      const at = sec(segment.at + (event.t - segment.from) / rate);
      if (event.kind === "key") return [{ name: `key${(keyIndex++ % 3) + 1}`, at, volume: 0.45 }];
      return [{ name: "click", at, volume: 0.5 }];
    });
  });
  return (
    <>
      {sounds.map((sound) => (
        <Sfx key={`${sound.name}-${sound.at}`} name={sound.name} at={sound.at} volume={sound.volume} />
      ))}
    </>
  );
}

/** The size of the radio preview, counted up as it opens. */
function Count() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const n = Math.round(30 * EASE_OUT(interpolate(t, [0, 0.8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const out = interpolate(t, [1.5, 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ left: 120, top: 330, width: 560, opacity: out, pointerEvents: "none" }}>
      <div
        style={{
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 340,
          lineHeight: 1,
          letterSpacing: -16,
          color: FG,
          textShadow: "0 0 90px hsla(265,90%,60%,0.6)",
        }}
      >
        {n}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 26, color: MUTED, letterSpacing: 3, marginTop: 10 }}>songs, ready</div>
    </AbsoluteFill>
  );
}

function Music({ track }: { track: string }) {
  const frame = useCurrentFrame();
  return (
    <Audio
      src={staticFile(`music/${track}`)}
      volume={interpolate(frame, [TOTAL - 70, TOTAL - 2], [0.72, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
    />
  );
}

/** `track` is a file in public/music; `credit` is shown on the closing card when the music needs attribution. */
export function Promo({ track = "track.mp3", credit }: { track?: string; credit?: string }) {
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Sequence from={sec(TENSION.at)} durationInFrames={sec(TENSION.length)}>
        <Tension />
      </Sequence>
      <Sequence from={sec(REVEAL.at)} durationInFrames={sec(REVEAL.length)}>
        <Reveal />
      </Sequence>
      <Sequence from={sec(LYRICS.at)} durationInFrames={sec(LYRICS.length)}>
        <LyricsStage />
      </Sequence>
      {SEGMENTS.map((segment, index) => {
        // Each cut after the first starts a few frames early and fades in over the one before it.
        const lead = index > 0 ? FADE : 0;
        return (
          <Sequence key={segment.at} from={sec(segment.at) - lead} durationInFrames={sec(segment.length) + lead}>
            <Session
              from={segment.from - (lead / FPS) * (segment.rate ?? 1)}
              rate={segment.rate}
              cam={segment.cam}
              enter={segment.enter}
              spot={segment.spot}
              callouts={segment.callouts}
              flight={segment.flight}
              glow={segment.glow}
              fadeIn={lead}
            >
              <Captions lines={segment.captions} />
            </Session>
          </Sequence>
        );
      })}
      <Sequence from={sec(SHOWCASE.at)} durationInFrames={sec(SHOWCASE.length)}>
        <Showcase />
      </Sequence>
      <Sequence from={sec(PROOF.at)} durationInFrames={sec(PROOF.length)}>
        <Proof />
      </Sequence>
      <Sequence from={sec(OUTRO.at)} durationInFrames={sec(OUTRO.length)}>
        <Outro durationInFrames={sec(OUTRO.length)} credit={credit} />
      </Sequence>
      <Sequence from={sec(26)} durationInFrames={sec(2)}>
        <Count />
      </Sequence>
      <Sounds />
      <Sfx name="key1" at={sec(18)} volume={0.45} />
      <Sfx name="whoosh" at={sec(17.8)} volume={0.35} />
      <Sfx name="ding" at={sec(26.3)} volume={0.26} />
      <Music track={track} />
    </AbsoluteFill>
  );
}
