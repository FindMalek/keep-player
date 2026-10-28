import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Captions } from "./captions";
import { Tension } from "./hook";
import { Outro } from "./outro";
import { Reveal } from "./reveal";
import { EVENTS, Session, type View } from "./session";
import { Sfx } from "./sfx";
import { BG, sec } from "./theme";

// The 15 s cutdown: the same arc with the middle compressed. The score is the full track's riser, impact and groove, then
// its final hit, joined so the last impact lands on the closing card (public/music/track-short.mp3).
const TENSION = { at: 0, length: 3 };
const REVEAL = { at: 3, length: 4 };
const SEARCH = { at: 7, length: 3.2, from: 2.2, rate: 1.5 };
const LYRICS = { at: 10.2, length: 2.3, from: 14.5 };
const OUTRO = { at: 12.5, length: 2.5 };
export const SHORT_TOTAL = sec(OUTRO.at + OUTRO.length);

const SEARCH_CAM: View[] = [
  { t: 2.2, x: 1010, y: 200, z: 1.3 },
  { t: 3.4, x: 1010, y: 200, z: 1.3 },
  { t: 3.9, x: 960, y: 360, z: 1.55 },
  { t: 5.4, x: 960, y: 360, z: 1.55 },
  { t: 6, x: 850, y: 430, z: 1.45 },
  { t: 7, x: 850, y: 430, z: 1.45 },
];
const LYRICS_CAM: View[] = [
  { t: 14.5, x: 1620, y: 380, z: 1.55 },
  { t: 16.8, x: 1620, y: 430, z: 1.65 },
];

function Sounds() {
  let key = 0;
  const place = (at: number, from: number, length: number, rate: number) =>
    EVENTS.flatMap((event) => {
      if (event.kind === "move" || event.t < from || event.t >= from + length * rate) return [];
      const when = sec(at + (event.t - from) / rate);
      return event.kind === "key" ? [{ name: `key${(key++ % 3) + 1}`, at: when }] : [{ name: "click", at: when }];
    });
  const all = [...place(SEARCH.at, SEARCH.from, SEARCH.length, SEARCH.rate), ...place(LYRICS.at, LYRICS.from, LYRICS.length, 1)];
  return (
    <>
      {all.map((sound) => (
        <Sfx key={`${sound.name}-${sound.at}`} name={sound.name} at={sound.at} volume={0.45} />
      ))}
    </>
  );
}

function Music() {
  const frame = useCurrentFrame();
  return (
    <Audio
      src={staticFile("music/track-short.mp3")}
      volume={interpolate(frame, [SHORT_TOTAL - 50, SHORT_TOTAL - 2], [0.64, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
    />
  );
}

export function Short() {
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Sequence from={sec(TENSION.at)} durationInFrames={sec(TENSION.length)}>
        <Tension length={TENSION.length} />
      </Sequence>
      <Sequence from={sec(REVEAL.at)} durationInFrames={sec(REVEAL.length)}>
        <Reveal />
      </Sequence>
      <Sequence from={sec(SEARCH.at)} durationInFrames={sec(SEARCH.length)}>
        <Session from={SEARCH.from} rate={SEARCH.rate} cam={SEARCH_CAM}>
          <Captions lines={[{ text: "Search. Hear it.", sub: "songs · albums · artists · lyrics", from: 0.2, to: 3.2 }]} />
        </Session>
      </Sequence>
      <Sequence from={sec(LYRICS.at)} durationInFrames={sec(LYRICS.length)}>
        <Session from={LYRICS.from} cam={LYRICS_CAM}>
          <Captions lines={[{ text: "Synced lyrics. One key.", from: 0.1, to: 2.3 }]} />
        </Session>
      </Sequence>
      <Sequence from={sec(OUTRO.at)} durationInFrames={sec(OUTRO.length)}>
        <Outro durationInFrames={sec(OUTRO.length)} />
      </Sequence>
      <Sounds />
      <Music />
    </AbsoluteFill>
  );
}
