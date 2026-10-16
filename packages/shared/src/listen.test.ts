import { expect, test } from "bun:test";
import { clockOffset, correction, expectedPosition, parseClientMessage } from "./listen";

const song = { id: "s1", title: "Angel" };

test("the expected playhead moves with the clock only while playing", () => {
  const offset = clockOffset(10_000, 4_000);
  expect(expectedPosition({ song, position: 30, playing: true }, 10_000, offset, 6_000)).toBeCloseTo(32, 5);
  expect(expectedPosition({ song, position: 30, playing: false }, 10_000, offset, 6_000)).toBe(30);
  // A message stamped in the future (clock jitter) never rewinds the playhead.
  expect(expectedPosition({ song, position: 30, playing: true }, 13_000, offset, 6_000)).toBe(30);
});

test("small drift is left alone, larger is corrected", () => {
  expect(correction(30.1, 30)).toEqual({ kind: "none" });
  expect(correction(31, 30)).toEqual({ kind: "seek", to: 30 });
  expect(correction(5, -1)).toEqual({ kind: "seek", to: 0 });
});

test("client messages are validated and songs trimmed", () => {
  expect(parseClientMessage("not json")).toBeNull();
  expect(parseClientMessage('{"t":"nope"}')).toBeNull();
  expect(parseClientMessage('{"t":"state","state":{"song":null,"position":"x","playing":true}}')).toBeNull();
  expect(parseClientMessage('{"t":"add","song":{"id":1}}')).toBeNull();
  expect(parseClientMessage(`{"t":"add","song":{"id":"a","title":"b","password":"x"}}`)).toEqual({
    t: "add",
    song: { id: "a", title: "b" },
  });
  expect(parseClientMessage("x".repeat(9000))).toBeNull();
  expect(parseClientMessage('{"t":"state","state":{"song":null,"position":-4,"playing":false}}')).toEqual({
    t: "state",
    state: { song: null, position: 0, playing: false },
  });
});
