import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";

/** A sound effect that starts on an absolute frame of the film. */
export function Sfx({ name, at, volume = 0.6 }: { name: string; at: number; volume?: number }) {
  return (
    <Sequence from={Math.max(0, at)} durationInFrames={240} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
}
