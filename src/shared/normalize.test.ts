import { expect, test } from "bun:test";
import { normalize, similarity } from "./normalize";

test("normalization folds the differences people don't type", () => {
  expect(normalize("Beyoncé")).toBe("beyonce");
  expect(normalize("AC/DC")).toBe("ac dc");
  expect(normalize("The Beatles")).toBe("beatles");
  expect(normalize("Simon & Garfunkel")).toBe("simon and garfunkel");
  expect(normalize("Don't Stop (feat. Someone)")).toBe("dont stop");
  expect(normalize("Sigur Rós")).toBe("sigur ros");
});

test("trigram similarity forgives typos and missing spaces", () => {
  expect(similarity("radiohed", "Radiohead")).toBeGreaterThan(0.6);
  expect(similarity("okcomputer", "OK Computer")).toBe(1);
  expect(similarity("acdc", "AC/DC")).toBe(1);
  expect(similarity("metallica", "Radiohead")).toBeLessThan(0.2);
});
