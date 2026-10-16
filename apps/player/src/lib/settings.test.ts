import { describe, expect, test } from "bun:test";
import { SYNCED, sanitize } from "./settings";

describe("settings", () => {
  test("the audio settings follow you to every browser, the stream quality does not", () => {
    for (const key of ["crossfade", "normalization", "preamp", "eqOn", "eqGains"]) expect(SYNCED as readonly string[]).toContain(key);
    expect(SYNCED as readonly string[]).not.toContain("streamQuality");
  });
  test("sanitize keeps values from the server in range and of the right type", () => {
    expect(sanitize("crossfade", 99)).toBe(12);
    expect(sanitize("crossfade", -3)).toBe(0);
    expect(sanitize("preamp", 50)).toBe(12);
    expect(sanitize("normalization", "album")).toBe("album");
    expect(sanitize("normalization", "loud")).toBeUndefined();
    expect(sanitize("eqOn", "yes")).toBeUndefined();
    expect(sanitize("eqGains", [30, -30, "x"])).toEqual([12, -12, 0]);
    expect(sanitize("eqGains", "nope")).toBeUndefined();
  });
});

describe("notifications level", () => {
  test("a value from another browser is kept only if it is a level", () => {
    expect(sanitize("toasts", "important")).toBe("important");
    expect(sanitize("toasts", "loud")).toBeUndefined();
    expect(sanitize("toasts", 3)).toBeUndefined();
  });
});
