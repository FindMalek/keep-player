import { expect, test } from "bun:test";
import { parseQuery } from "./search-query";

test("operators become filters and chips, the rest stays the text", () => {
  const parsed = parseQuery('love artist:"pink floyd" year:1970..1979 is:liked format:FLAC genre:rock');
  expect(parsed.text).toBe("love");
  expect(parsed.filters).toEqual({ artist: "pink floyd", year: [1970, 1979], liked: true, format: "flac", genre: "rock" });
  expect(parsed.chips.map((chip) => chip.raw)).toEqual(['artist:"pink floyd"', "year:1970..1979", "is:liked", "format:FLAC", "genre:rock"]);
  expect(parseQuery("year:1994 is:nonsense").filters).toEqual({ year: [1994, 1994] });
  expect(parseQuery("year:1994 is:nonsense").text).toBe("is:nonsense");
});

test("artist - title and title by artist, and lyrics: takes the rest literally", () => {
  expect(parseQuery("radiohead - creep").pairs).toEqual([
    { artist: "radiohead", title: "creep" },
    { artist: "creep", title: "radiohead" },
  ]);
  expect(parseQuery("creep by radiohead").pairs).toEqual([{ title: "creep", artist: "radiohead" }]);
  expect(parseQuery("lyrics: is this the real life")).toMatchObject({ lyricsOnly: true, text: "is this the real life", chips: [] });
});

test("moment: finds songs by a moment's note, is:moment any song with one", () => {
  expect(parseQuery('moment:"the drop" bass').filters.moment).toBe("the drop");
  expect(parseQuery("is:moment").filters).toEqual({ moment: "" });
  expect(parseQuery("is:moment").chips).toEqual([{ key: "is", value: "moment", raw: "is:moment" }]);
});

test("bpm:, energy: and mood: take ranges, levels and a word, and ignore what they can't read", () => {
  const parsed = parseQuery("bpm:120..130 energy:high mood:Chill");
  expect(parsed.filters).toEqual({ bpm: [120, 130], energy: [0.7, 1], mood: "chill" });
  expect(parseQuery("bpm:..90 energy:0.2..0.5").filters).toEqual({ bpm: [0, 90], energy: [0.2, 0.5] });
  expect(parseQuery("bpm:fast").text).toBe("bpm:fast");
});
