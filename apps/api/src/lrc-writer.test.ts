import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LrcWriter } from "./lrc-writer";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "lrc-"));
  mkdirSync(join(root, "Artist", "Album"), { recursive: true });
  writeFileSync(join(root, "Artist", "Album", "01 Song.flac"), "audio");
  return { root, writer: new LrcWriter(new Database(":memory:"), root) };
}

describe("LrcWriter", () => {
  test("writes next to the audio file, from a relative or a differently mounted absolute path", () => {
    const { root, writer } = setup();
    expect(writer.target("Artist/Album/01 Song.flac")).toBe(join(root, "Artist", "Album", "01 Song.lrc"));
    expect(writer.target("/music/Artist/Album/01 Song.flac")).toBe(join(root, "Artist", "Album", "01 Song.lrc"));
    expect(writer.write("s", { id: "1", path: "Artist/Album/01 Song.flac" }, "[00:01.00]hello")).toBe(true);
    expect(readFileSync(join(root, "Artist", "Album", "01 Song.lrc"), "utf8")).toBe("[00:01.00]hello\n");
    expect(writer.count("s")).toBe(1);
  });

  test("never leaves the folder, never writes without the audio file", () => {
    const { writer } = setup();
    expect(writer.target("../../etc/passwd")).toBeNull();
    expect(writer.target("Artist/Album/02 Missing.flac")).toBeNull();
    expect(writer.target(undefined)).toBeNull();
  });

  test("never overwrites an existing file", () => {
    const { root, writer } = setup();
    const lrc = join(root, "Artist", "Album", "01 Song.lrc");
    writeFileSync(lrc, "mine");
    expect(writer.write("s", { id: "1", path: "Artist/Album/01 Song.flac" }, "[00:01.00]hello")).toBe(false);
    expect(readFileSync(lrc, "utf8")).toBe("mine");
    expect(writer.count("s")).toBe(0);
  });

  test("undo removes only files still as written", () => {
    const { root, writer } = setup();
    writeFileSync(join(root, "Artist", "Album", "02 Other.mp3"), "audio");
    writer.write("s", { id: "1", path: "Artist/Album/01 Song.flac" }, "one");
    writer.write("s", { id: "2", path: "Artist/Album/02 Other.mp3" }, "two");
    writeFileSync(join(root, "Artist", "Album", "02 Other.lrc"), "edited by hand");
    expect(writer.undoAll("s")).toEqual({ removed: 1, kept: 1 });
    expect(existsSync(join(root, "Artist", "Album", "01 Song.lrc"))).toBe(false);
    expect(existsSync(join(root, "Artist", "Album", "02 Other.lrc"))).toBe(true);
    expect(writer.count("s")).toBe(0);
  });
});
