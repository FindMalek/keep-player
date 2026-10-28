import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, Html5Audio, OffthreadVideo, staticFile } from "remotion";
import { Title } from "./title";

export const FPS = 60;
const TRANSITION = 12;

// Scene lengths in frames. Clips are Playwright or screen recordings in `public/clips`; a scene without a clip shows
// its title card only.
const SCENES = [
  { title: "your music. your server.", clip: undefined, frames: 120 },
  { title: "search anything", clip: "search.webm", frames: 150 },
  { title: "the notch", clip: "notch.mp4", frames: 150 },
  { title: "lyrics", clip: "lyrics.webm", frames: 150 },
  { title: "radio", clip: "radio.webm", frames: 150 },
  { title: "keep music", clip: undefined, frames: 150 },
];

export const totalFrames = SCENES.reduce((sum, scene) => sum + scene.frames, 0) - TRANSITION * (SCENES.length - 1);

export function Promo() {
  return (
    <AbsoluteFill style={{ background: "#0a0a0a" }}>
      <TransitionSeries>
        {SCENES.flatMap((scene, index) => [
          ...(index
            ? [
                <TransitionSeries.Transition
                  key={`to-${scene.title}`}
                  presentation={slide()}
                  timing={linearTiming({ durationInFrames: TRANSITION })}
                />,
              ]
            : []),
          <TransitionSeries.Sequence key={scene.title} durationInFrames={scene.frames}>
            <AbsoluteFill>
              {scene.clip ? (
                <OffthreadVideo src={staticFile(`clips/${scene.clip}`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : null}
              <Title text={scene.title} />
            </AbsoluteFill>
          </TransitionSeries.Sequence>,
        ])}
      </TransitionSeries>
      <Html5Audio src={staticFile("music/track.mp3")} />
    </AbsoluteFill>
  );
}
