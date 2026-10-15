import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { normalize } from "../shared/normalize";
import { confidence, matchTrack } from "./import-match";
import { createIndexTables } from "./search-index";

const songs = [
  { id: "s1", title: "Angel", artist: "Massive Attack", album: "Mezzanine", duration: 379, isrc: ["GBAAA9800001"] },
  { id: "s2", title: "Angel (Live)", artist: "Massive Attack", album: "Live", duration: 420 },
  { id: "s3", title: "Teardrop", artist: "Massive Attack", album: "Mezzanine", duration: 330 },
  { id: "s4", title: "Creep", artist: "Radiohead", album: "Pablo Honey", duration: 238 },
];

function library(): Database {
  const db = new Database(":memory:");
  createIndexTables(db);
  for (const song of songs) {
    const text = normalize(`${song.title} ${song.artist} ${song.album}`);
    const row = db
      .query<{ rowid: number }, [string, string, string, string]>(
        "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('default', 'song', ?, '1', ?, ?, 0, ?, 1) returning rowid",
      )
      .get(song.id, song.title, normalize(song.title), JSON.stringify(song));
    db.query("insert into fts_words (rowid, text) values (?, ?)").run(row?.rowid as number, text);
    db.query("insert into fts_trigram (rowid, text) values (?, ?)").run(row?.rowid as number, `${text} ${text.replace(/\s+/g, "")}`);
  }
  return db;
}

test("an ISRC match is certain", () => {
  expect(confidence({ title: "whatever", artist: "who", isrc: "gbaaa9800001" }, songs[0] as never)).toBe(1);
});

test("title and artist agree, and the duration breaks ties between versions", () => {
  const track = { title: "Angel", artist: "Massive Attack", durationMs: 379_000 };
  const studio = confidence(track, songs[0] as never);
  const live = confidence(track, { ...songs[1], title: "Angel" } as never);
  expect(studio).toBeGreaterThanOrEqual(0.95);
  expect(live).toBeLessThan(studio);
  expect(live).toBeLessThan(0.85);
});

test("finds the song through accents, case and a trailing credit, and offers the alternatives", () => {
  const db = library();
  const match = matchTrack(db, "default", null, { title: "ANGEL", artist: "massive attack", durationMs: 380_000 });
  expect(match.best?.id).toBe("s1");
  expect(match.best?.confidence).toBeGreaterThanOrEqual(0.85);
  expect(match.alternatives.map((alternative) => alternative.id)).toContain("s2");
});

test("a typo still finds it, with a lower confidence, and a song we don't have finds nothing", () => {
  const db = library();
  const typo = matchTrack(db, "default", null, { title: "Teardrp", artist: "Massive Atack" });
  expect(typo.best?.id).toBe("s3");
  expect(typo.best?.confidence).toBeLessThan(1);
  const missing = matchTrack(db, "default", null, { title: "Paranoid Android", artist: "Radiohead", durationMs: 386_000 });
  expect(missing.best).toBeNull();
});

test("folders the user may not see are never offered", () => {
  const db = library();
  expect(matchTrack(db, "default", ["2"], { title: "Creep", artist: "Radiohead" }).best).toBeNull();
});
