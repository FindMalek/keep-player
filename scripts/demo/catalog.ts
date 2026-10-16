import { random } from "./random";

export interface DemoTrack {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  year: number;
  genre: string;
  track: number;
  disc: number;
  seed: number;
  bpm: number;
  scale: "major" | "minor" | "dorian" | "pentatonic";
  root: number;
  format: "flac" | "mp3" | "opus";
  lyrics: boolean;
  coverSeed: number;
}

export interface DemoAlbum {
  artist: string;
  name: string;
  year: number;
  genre: string;
  coverSeed: number;
  tracks: DemoTrack[];
}

const ARTISTS: { name: string; genre: string; bpm: [number, number]; scale: DemoTrack["scale"] }[] = [
  { name: "Halcyon Static", genre: "Electronic", bpm: [112, 128], scale: "minor" },
  { name: "The Paper Lanterns", genre: "Indie", bpm: [90, 108], scale: "major" },
  { name: "Marlow Quartet", genre: "Jazz", bpm: [72, 96], scale: "dorian" },
  { name: "Velvet Harbor", genre: "Ambient", bpm: [58, 72], scale: "pentatonic" },
  { name: "North of Nowhere", genre: "Folk", bpm: [80, 100], scale: "major" },
  { name: "Cinder & Glass", genre: "Rock", bpm: [118, 140], scale: "minor" },
  { name: "Ivory Motors", genre: "Soul", bpm: [84, 104], scale: "dorian" },
  { name: "Satellite Garden", genre: "Pop", bpm: [100, 120], scale: "major" },
];

const ALBUM_WORDS = [
  "Orbit",
  "Quiet Hours",
  "Low Tide",
  "Signal Fires",
  "Afterglow",
  "Paper Moons",
  "Slow Weather",
  "Ember",
  "Night Shift",
  "Glasshouse",
  "Distance",
  "Winter Lights",
];
const TITLE_WORDS = [
  "Echo",
  "Harbor",
  "Violet",
  "Neon",
  "River",
  "Static",
  "Lantern",
  "Hollow",
  "Summer",
  "Atlas",
  "Mirror",
  "Fever",
  "Ocean",
  "Silver",
  "North",
  "Ember",
  "Glass",
  "Orbit",
  "Velvet",
  "Morning",
  "Signal",
  "Garden",
];
const TITLE_TAILS = ["", "", "", " Again", " (Reprise)", " Pt. 2", " in Blue", " at Night"];

/** The whole demo library as data, deterministic from `seed`: same artists, albums, titles and tags every run. */
export function createCatalog(seed = 2026): DemoAlbum[] {
  const next = random(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
  const albums: DemoAlbum[] = [];
  const usedAlbums = new Set<string>();
  let trackSeed = seed * 31;
  let coverSeed = seed;

  for (const artist of ARTISTS) {
    const albumTotal = 2 + Math.floor(next() * 2);
    for (let a = 0; a < albumTotal; a += 1) {
      let name = pick(ALBUM_WORDS);
      while (usedAlbums.has(name)) name = `${pick(ALBUM_WORDS)} ${pick(["II", "III", "Live", "Sessions"])}`;
      usedAlbums.add(name);
      const year = 2008 + Math.floor(next() * 18);
      coverSeed += 1;
      const album: DemoAlbum = { artist: artist.name, name, year, genre: artist.genre, coverSeed, tracks: [] };
      const trackTotal = 7 + Math.floor(next() * 4);
      const used = new Set<string>();
      for (let t = 1; t <= trackTotal; t += 1) {
        let title = `${pick(TITLE_WORDS)} ${pick(TITLE_WORDS)}${pick(TITLE_TAILS)}`;
        while (used.has(title)) title = `${pick(TITLE_WORDS)}${pick(TITLE_TAILS)}`;
        used.add(title);
        trackSeed += 1;
        const [low, high] = artist.bpm;
        album.tracks.push({
          title,
          artist: artist.name,
          album: name,
          albumArtist: artist.name,
          year,
          genre: artist.genre,
          track: t,
          disc: 1,
          seed: trackSeed,
          bpm: low + Math.floor(next() * (high - low)),
          scale: next() < 0.2 ? "pentatonic" : artist.scale,
          root: 48 + Math.floor(next() * 12),
          // Mostly FLAC, so the quality badges and the doctor see a believable mix.
          format: next() < 0.65 ? "flac" : next() < 0.8 ? "opus" : "mp3",
          lyrics: next() < 0.6,
          coverSeed,
        });
      }
      albums.push(album);
    }
  }
  return albums;
}

/** Synced lyrics for a demo track: made-up lines, one every ~4 seconds, in LRC. */
export function lrcFor(track: DemoTrack, seconds: number): string {
  const next = random(track.seed * 17);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
  const lines = [
    "I keep the lights on for",
    "the quiet between",
    "your name in the static",
    "we were never leaving",
    "hold the morning a while",
    "every window a river",
    "say it slowly",
    "carry me home",
  ];
  const out = [`[ti:${track.title}]`, `[ar:${track.artist}]`, `[al:${track.album}]`];
  for (let t = 3; t < seconds - 3; t += 4) {
    const minutes = String(Math.floor(t / 60)).padStart(2, "0");
    const secs = (t % 60).toFixed(2).padStart(5, "0");
    out.push(`[${minutes}:${secs}] ${pick(lines)} ${pick(TITLE_WORDS).toLowerCase()}`);
  }
  return out.join("\n");
}
