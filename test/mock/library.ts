import type { Album, Song as AppSong, Artist, Playlist } from "../../apps/player/src/lib/types";

/** Songs as getSong returns them: the list fields plus where the file lives and what it is. */
type Song = AppSong & { parent?: string; path?: string; samplingRate?: number; channelCount?: number };

/** Navidrome's getLyricsBySongId shape. */
interface StructuredLyrics {
  synced: boolean;
  line: { start?: number; value: string }[];
}

/** Deterministic fake library, so e2e runs and perf budgets see the same data every time. */
export interface Library {
  artists: Artist[];
  albums: Album[];
  songs: Song[];
  playlists: Playlist[];
  genres: string[];
  lyrics: Map<string, StructuredLyrics>;
}

const GENRES = ["Rock", "Electronic", "Jazz", "Hip-Hop", "Classical", "Folk", "Ambient", "Pop", "Metal", "Soul", "Blues", "Indie"];
const WORDS = [
  "night",
  "glass",
  "river",
  "static",
  "orbit",
  "paper",
  "echo",
  "velvet",
  "signal",
  "harbor",
  "ember",
  "hollow",
  "neon",
  "quiet",
  "summer",
  "atlas",
  "violet",
  "winter",
  "motor",
  "silver",
  "garden",
  "fever",
  "ocean",
  "lantern",
  "cinder",
  "mirror",
  "north",
  "satellite",
];

function random(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createLibrary(trackCount = 10_000, seed = 7): Library {
  const next = random(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(next() * items.length)] as T;
  const title = (words: number): string =>
    Array.from({ length: words }, () => pick(WORDS))
      .join(" ")
      .replace(/^./, (letter) => letter.toUpperCase());

  const artists: Artist[] = [];
  const albums: Album[] = [];
  const songs: Song[] = [];
  const lyrics = new Map<string, StructuredLyrics>();
  const created = Date.UTC(2026, 0, 1);

  for (let a = 0; songs.length < trackCount; a += 1) {
    const artist: Artist = { id: `ar-${a}`, name: `${title(2)} ${a}`, albumCount: 0, coverArt: `ar-${a}`, album: [] };
    artists.push(artist);
    const albumTotal = 1 + Math.floor(next() * 6);
    for (let b = 0; b < albumTotal && songs.length < trackCount; b += 1) {
      const genre = pick(GENRES);
      const album: Album = {
        id: `al-${albums.length}`,
        name: title(1 + Math.floor(next() * 3)),
        artist: artist.name,
        artistId: artist.id,
        coverArt: `al-${albums.length}`,
        year: 1970 + Math.floor(next() * 56),
        genre,
        genres: [{ name: genre }],
        created: new Date(created + albums.length * 3_600_000).toISOString(),
        playCount: Math.floor(next() * 50),
        // Release types and a second disc, by position (no random draws, so every other fixture stays as it was).
        releaseTypes: [albums.length % 4 === 1 ? "ep" : albums.length % 7 === 3 ? "single" : "album"],
        song: [],
      };
      const trackTotal = 6 + Math.floor(next() * 10);
      for (let t = 1; t <= trackTotal && songs.length < trackCount; t += 1) {
        const song: Song = {
          id: `so-${songs.length}`,
          title: title(1 + Math.floor(next() * 3)),
          album: album.name,
          albumId: album.id,
          artist: artist.name,
          artistId: artist.id,
          track: t,
          discNumber: album.id === "al-5" && t > trackTotal / 2 ? 2 : 1,
          parent: album.id,
          path: `${artist.name}/${album.name}/${String(t).padStart(2, "0")}.mp3`,
          samplingRate: 44100,
          channelCount: 2,
          year: album.year,
          genre,
          coverArt: album.coverArt,
          duration: 120 + Math.floor(next() * 240),
          bitRate: 320,
          suffix: "mp3",
          size: 8_000_000,
          playCount: Math.floor(next() * 20),
          created: album.created,
          replayGain: { trackGain: -6 - next() * 4, albumGain: -7, trackPeak: 0.98, albumPeak: 0.99 },
        };
        songs.push(song);
        album.song?.push(song);
        if (songs.length % 3 === 0) {
          const line = Array.from({ length: 24 }, (_, i) => ({ start: i * 5000, value: `${title(4)} line ${i + 1}` }));
          lyrics.set(song.id, { synced: true, line });
        } else if (songs.length % 3 === 1) {
          lyrics.set(song.id, { synced: false, line: [{ value: title(5) }, { value: title(5) }] });
        }
      }
      album.songCount = album.song?.length ?? 0;
      album.duration = album.song?.reduce((sum, song) => sum + (song.duration ?? 0), 0);
      albums.push(album);
      artist.album?.push(album);
    }
    artist.albumCount = artist.album?.length ?? 0;
  }

  const playlists: Playlist[] = ["Mix / Morning", "Mix / Late night", "Running", "Favorites"].map((name, index) => {
    const entry = songs.slice(index * 40, index * 40 + 25 + index * 10);
    return {
      id: `pl-${index}`,
      name,
      songCount: entry.length,
      duration: entry.reduce((sum, song) => sum + (song.duration ?? 0), 0),
      owner: "demo",
      changed: new Date(created).toISOString(),
      entry,
    };
  });
  // A smart playlist (Navidrome .nsp rules): readable, not editable.
  const smart = songs.slice(500, 520);
  playlists.push({
    id: "pl-smart",
    name: "Recently added",
    songCount: smart.length,
    duration: smart.reduce((sum, song) => sum + (song.duration ?? 0), 0),
    owner: "demo",
    readonly: true,
    changed: new Date(created).toISOString(),
    entry: smart,
  });

  return { artists, albums, songs, playlists, genres: GENRES, lyrics };
}
