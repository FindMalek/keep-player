import { Composition } from "remotion";
import { Promo, TOTAL } from "./promo";
import { SHORT_TOTAL, Short } from "./short";
import { FPS } from "./theme";

export function Root() {
  return (
    <>
      <Composition id="promo" component={Promo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
      <Composition id="short" component={Short} durationInFrames={SHORT_TOTAL} fps={FPS} width={1920} height={1080} />
      <Composition id="short-vertical" component={Short} durationInFrames={SHORT_TOTAL} fps={FPS} width={1080} height={1920} />
      <Composition
        id="promo-alt"
        component={Promo}
        durationInFrames={TOTAL}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ track: "track-alt.mp3", credit: 'Music: "Ghost Story" by Kevin MacLeod (incompetech.com), CC BY 4.0' }}
      />
      <Composition id="promo-vertical" component={Promo} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
    </>
  );
}
