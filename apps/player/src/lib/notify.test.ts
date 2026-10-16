import { expect, test } from "bun:test";
import { shouldShow } from "./notify-level";

const plain = { kind: "info" as const };
const undo = { kind: "info" as const, action: { label: "undo", onClick: () => {} } };
const resume = { kind: "info" as const, cancel: { label: "keep mine", onClick: () => {} } };
const error = { kind: "error" as const };

test("at all, every notice shows", () => {
  for (const notice of [plain, undo, resume, error]) expect(shouldShow("all", notice)).toBe(true);
});

test("at important, plain confirmations are dropped and anything you can act on stays", () => {
  expect(shouldShow("important", plain)).toBe(false);
  expect(shouldShow("important", undo)).toBe(true);
  expect(shouldShow("important", resume)).toBe(true);
  expect(shouldShow("important", error)).toBe(true);
});

test("at errors, only errors show", () => {
  expect(shouldShow("errors", plain)).toBe(false);
  expect(shouldShow("errors", undo)).toBe(false);
  expect(shouldShow("errors", error)).toBe(true);
});
