import { expect, test } from "bun:test";
import { findColors } from "./check-colors";

test("flags palette classes, arbitrary and literal colors but not theme tokens", () => {
  const source = [
    '<div className="bg-primary text-muted-foreground" />',
    '<p className="text-red-500" />',
    '<i className="bg-[#fff]" />',
    "color: rgb(0 0 0);",
  ].join("\n");
  expect(findColors(source).map((hit) => hit.line)).toEqual([2, 3, 4]);
});
