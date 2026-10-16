import { describe, expect, test } from "bun:test";
import { BANDS, clampGains, FLAT, fromDb, headroom, PRESETS, presetOf } from "./eq";

describe("equalizer maths", () => {
  test("every preset has one value per band, within ±12", () => {
    for (const gains of Object.values(PRESETS)) {
      expect(gains).toHaveLength(BANDS.length);
      for (const gain of gains) expect(Math.abs(gain)).toBeLessThanOrEqual(12);
    }
  });
  test("clampGains pads, clamps and cleans junk", () => {
    expect(clampGains(undefined)).toEqual(FLAT);
    expect(clampGains([20, -20, "x", null, 3])).toEqual([12, -12, 0, 0, 3, 0, 0, 0, 0, 0]);
  });
  test("presetOf finds a preset by its gains", () => {
    expect(presetOf([...FLAT])).toBe("flat");
    expect(presetOf([1, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });
  test("headroom takes the loudest boost off, and nothing for cuts", () => {
    expect(headroom(FLAT)).toBe(1);
    expect(headroom([-6, -3, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(1);
    expect(headroom([6, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeCloseTo(0.501, 3);
  });
  test("fromDb", () => {
    expect(fromDb(0)).toBe(1);
    expect(fromDb(-6)).toBeCloseTo(0.501, 3);
  });
});
