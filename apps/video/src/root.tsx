import { Composition } from "remotion";
import { FPS, Promo, totalFrames } from "./promo";

export function Root() {
  return (
    <>
      <Composition id="promo" component={Promo} durationInFrames={totalFrames} fps={FPS} width={1920} height={1080} />
      <Composition id="promo-vertical" component={Promo} durationInFrames={totalFrames} fps={FPS} width={1080} height={1920} />
    </>
  );
}
