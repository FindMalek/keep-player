import { expect, test } from "bun:test";
import { decodeLook, encodeLook, lookCss, PRESETS } from "./look-code";

test("every preset survives a trip through its code", () => {
  for (const { look } of PRESETS) expect(decodeLook(encodeLook(look))).toEqual(look);
});

test("codes that are not ours decode to nothing", () => {
  for (const code of ["", "lode1", "lode2.warm.ink.0.plex", "lode1.pink.ink.0.plex", "lode1.warm.ink.3.plex", "lode1.warm.ink.0.plex.x"])
    expect(decodeLook(code)).toBeNull();
  expect(decodeLook(" lode1.cool.steel.4.mono ")).toEqual({ tone: "cool", accent: "steel", radius: 4, font: "mono" });
});

test("the default look adds no css", () => {
  expect(lookCss(PRESETS[0]?.look as never)).toBe("");
  expect(lookCss(PRESETS[3]?.look as never)).toContain("JetBrains Mono");
});
