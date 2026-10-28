import { CanvasTexture, SRGBColorSpace } from "three";
import { coverSvg } from "../../../test/mock/covers";
import { showcaseCovers } from "../../../test/mock/showcase";

/** The showcase library's sleeve art as textures: each cover's SVG is drawn onto a canvas. */
export async function showcaseTextures(size = 384): Promise<CanvasTexture[]> {
  return Promise.all(
    [...showcaseCovers().values()].map(async (spec) => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coverSvg(spec))}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.getContext("2d")?.drawImage(image, 0, 0, size, size);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      return texture;
    }),
  );
}
