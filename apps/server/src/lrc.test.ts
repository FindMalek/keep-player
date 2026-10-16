import { expect, test } from "bun:test";
import { parseLrc } from "./lrc";

test("several timestamps on one line, sorted, with ends from the next line", () => {
  const { lines } = parseLrc("[00:10.00][00:30.00]chorus\n[00:20.50]verse");
  expect(lines.map((line) => [line.start, line.end, line.text])).toEqual([
    [10_000, 20_500, "chorus"],
    [20_500, 30_000, "verse"],
    [30_000, 35_000, "chorus"],
  ]);
});

test("BOM, CRLF, blank timed lines and fractions of any length", () => {
  const { lines } = parseLrc("﻿[ar:someone]\r\n[00:01.5]one\r\n[00:02.05]\r\n[00:03.005]three");
  expect(lines.map((line) => [line.start, line.text])).toEqual([
    [1500, "one"],
    [2050, ""],
    [3005, "three"],
  ]);
});

test("[offset:] shifts every time (positive is earlier), never below zero", () => {
  const { lines, offset } = parseLrc("[offset:-500]\n[00:01.00]a\n[offset:ignored]");
  expect(offset).toBe(-500);
  expect(lines[0]?.start).toBe(1500);
  expect(parseLrc("[offset:+2000]\n[00:01.00]a").lines[0]?.start).toBe(0);
});

test("Enhanced LRC word timings", () => {
  const { lines } = parseLrc("[00:05.00]<00:05.00>hello <00:05.60>bright <00:06.10>world");
  expect(lines[0]?.text).toBe("hello bright world");
  expect(lines[0]?.words).toEqual([
    { start: 5000, text: "hello" },
    { start: 5600, text: "bright" },
    { start: 6100, text: "world" },
  ]);
});
