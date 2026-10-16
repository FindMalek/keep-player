import { expect, test } from "bun:test";
import { markPlaybackSession } from "./decks";

test("the audio session is marked playback where the browser has one", () => {
  const nav = { audioSession: { type: "auto" } };
  markPlaybackSession(nav);
  expect(nav.audioSession.type).toBe("playback");
});

test("browsers without an audio session, or with a read-only one, are left alone", () => {
  expect(() => markPlaybackSession({})).not.toThrow();
  const frozen = Object.defineProperty({ audioSession: {} as { type: string } }, "audioSession", { value: {} });
  Object.defineProperty(frozen.audioSession, "type", {
    get: () => "auto",
    set: () => {
      throw new Error("read-only");
    },
  });
  expect(() => markPlaybackSession(frozen)).not.toThrow();
});
