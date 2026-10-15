import { describe, expect, test } from "bun:test";
import { auraParams, hash, noise2, prng, vibe } from "./aura";

describe("determinism", () => {
  test("the same id and songs give the same aura, another id another one", () => {
    const songs = [{ genre: "Rock", year: 1999 }];
    expect(auraParams("pl-1", songs)).toEqual(auraParams("pl-1", songs));
    expect(auraParams("pl-2", songs).seed).not.toBe(auraParams("pl-1", songs).seed);
  });
  test("hash, random stream and noise are stable and in range", () => {
    expect(hash("a")).toBe(hash("a"));
    const next = prng(7);
    const values = Array.from({ length: 50 }, next);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(Array.from({ length: 5 }, prng(7))).toEqual(values.slice(0, 5));
    expect(noise2(3, 1.5, 2.5)).toBe(noise2(3, 1.5, 2.5));
    expect(noise2(3, 1.5, 2.5)).toBeGreaterThanOrEqual(0);
    expect(noise2(3, 1.5, 2.5)).toBeLessThan(1);
  });
});

describe("the look follows the music", () => {
  const metal = Array.from({ length: 10 }, () => ({ genre: "Heavy Metal", year: 2015 }));
  const folk = Array.from({ length: 10 }, () => ({ genre: "Folk", year: 1972 }));
  const techno = Array.from({ length: 10 }, () => ({ genre: "Techno", year: 2018 }));

  test("loud music has more energy and less softness than quiet music", () => {
    const loud = auraParams("x", metal);
    const quiet = auraParams("x", folk);
    expect(loud.energy).toBeGreaterThan(quiet.energy + 0.3);
    expect(loud.softness).toBeLessThan(quiet.softness);
    expect(loud.bpm).toBeGreaterThan(quiet.bpm);
  });
  test("folk is organic, techno geometric", () => {
    expect(auraParams("x", folk).organic).toBeGreaterThanOrEqual(0.5);
    expect(auraParams("x", techno).organic).toBeLessThan(0.5);
  });
  test("a BPM in the tags sets the tempo", () => {
    const slow = auraParams("x", [{ genre: "Rock", bpm: 70 }]);
    const fast = auraParams("x", [{ genre: "Rock", bpm: 170 }]);
    expect(slow.bpm).toBe(70);
    expect(fast.speed).toBeGreaterThan(slow.speed);
  });
  test("nothing known still gives a valid aura, and the vibe is three words", () => {
    const empty = auraParams("x", []);
    for (const key of ["energy", "softness", "organic", "density"] as const) {
      expect(empty[key]).toBeGreaterThanOrEqual(0);
      expect(empty[key]).toBeLessThanOrEqual(1);
    }
    expect(vibe(empty)).toHaveLength(3);
    expect(vibe(auraParams("x", folk))).toContain("calm");
    expect(vibe(auraParams("x", metal))).toContain("driving");
  });
});
