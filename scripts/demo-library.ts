// Generates a deterministic, copyright-free demo library: `bun scripts/demo-library.ts <dir> [--seconds 30] [--seed 2026]`
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createCatalog, type DemoTrack, lrcFor } from "./demo/catalog";
import { ditheredCover } from "./demo/cover";
import { random } from "./demo/random";
import { SAMPLE_RATE, synth } from "./demo/synth";

const args = process.argv.slice(2);
const flag = (name: string, fallback: number): number => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? Number(args[at + 1]) : fallback;
};
const dir = args.find((arg, i) => !arg.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!dir) {
  console.error("usage: bun scripts/demo-library.ts <dir> [--seconds 30] [--seed 2026]");
  process.exit(1);
}
const seconds = flag("seconds", 30);
const seed = flag("seed", 2026);

const safe = (name: string): string => name.replace(/[\\/:*?"<>|]/g, "_");
const pad = (n: number): string => String(n).padStart(2, "0");

async function encode(track: DemoTrack, pcm: Uint8Array, out: string, cover: string): Promise<void> {
  const embed = track.format !== "opus";
  const codec = { flac: ["-c:a", "flac"], mp3: ["-c:a", "libmp3lame", "-b:a", "256k"], opus: ["-c:a", "libopus", "-b:a", "160k"] }[
    track.format
  ];
  const gain = (-7 - (track.seed % 5)).toFixed(2);
  const tags = {
    title: track.title,
    artist: track.artist,
    album_artist: track.albumArtist,
    album: track.album,
    date: String(track.year),
    genre: track.genre,
    track: String(track.track),
    disc: String(track.disc),
    REPLAYGAIN_TRACK_GAIN: `${gain} dB`,
    REPLAYGAIN_ALBUM_GAIN: "-8.00 dB",
    REPLAYGAIN_TRACK_PEAK: "0.950000",
    REPLAYGAIN_ALBUM_PEAK: "0.980000",
    MUSICBRAINZ_TRACKID: uuid(track.seed),
    MUSICBRAINZ_ALBUMID: uuid(track.coverSeed + 9000),
  };
  const proc = Bun.spawn(
    [
      "ffmpeg",
      "-y",
      "-loglevel",
      "error",
      "-f",
      "s16le",
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      "2",
      "-i",
      "pipe:0",
      ...(embed ? ["-i", cover] : []),
      "-map",
      "0:a",
      ...(embed ? ["-map", "1:v", "-c:v", "copy", "-disposition:v", "attached_pic"] : []),
      ...codec,
      ...Object.entries(tags).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]),
      out,
    ],
    { stdin: "pipe", stderr: "inherit" },
  );
  proc.stdin.write(pcm);
  await proc.stdin.end();
  if ((await proc.exited) !== 0) throw new Error(`ffmpeg failed for ${out}`);
}

/** A stable, uuid-shaped id (v4 layout) from a seed, standing in for MusicBrainz ids. */
function uuid(n: number): string {
  const next = random(n);
  const hex = Array.from({ length: 32 }, () => Math.floor(next() * 16).toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, "Playlists"), { recursive: true });

const catalog = createCatalog(seed);
const files: { track: DemoTrack; path: string }[] = [];
let done = 0;
const total = catalog.reduce((sum, album) => sum + album.tracks.length, 0);

for (const album of catalog) {
  const albumDir = join(dir, safe(album.artist), safe(`${album.name} (${album.year})`));
  mkdirSync(albumDir, { recursive: true });
  const cover = join(albumDir, "cover.png");
  writeFileSync(cover, ditheredCover(album.coverSeed));
  for (const track of album.tracks) {
    const base = join(albumDir, `${pad(track.track)} - ${safe(track.title)}`);
    const pcm = synth({ seed: track.seed, seconds, bpm: track.bpm, scale: track.scale, root: track.root });
    const path = `${base}.${track.format}`;
    await encode(track, pcm, path, cover);
    if (track.lyrics) writeFileSync(`${base}.lrc`, lrcFor(track, seconds));
    files.push({ track, path });
    done += 1;
    if (done % 10 === 0 || done === total) process.stdout.write(`${done}/${total} tracks\n`);
  }
}

// Playlists: relative paths, so Navidrome imports them as read-only playlists from the Playlists folder.
const next = random(seed + 1);
const shuffled = [...files].sort(() => next() - 0.5);
const playlists: Record<string, typeof files> = {
  "Late Night Drive": shuffled.slice(0, 14),
  Focus: files.filter(({ track }) => track.genre === "Ambient" || track.genre === "Jazz").slice(0, 16),
  "Sunday Morning": files.filter(({ track }) => track.genre === "Folk" || track.genre === "Indie").slice(0, 12),
  Gym: files.filter(({ track }) => track.bpm > 115).slice(0, 12),
};
for (const [name, items] of Object.entries(playlists)) {
  const lines = ["#EXTM3U", `#PLAYLIST:${name}`, ...items.map(({ path }) => relative(join(dir, "Playlists"), path))];
  writeFileSync(join(dir, "Playlists", `${name}.m3u8`), `${lines.join("\n")}\n`);
}
console.log(`\n${total} tracks, ${catalog.length} albums, ${Object.keys(playlists).length} playlists in ${dir}`);
