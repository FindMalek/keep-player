import type { Album, Song as AppSong, Artist, Playlist } from "../../apps/player/src/lib/types";
import type { CoverSpec, Motif } from "./covers";
import type { Library } from "./library";

type Song = AppSong & { parent?: string; path?: string; samplingRate?: number; channelCount?: number };

interface AlbumSeed {
  name: string;
  year: number;
  motif: Motif;
  hues: [number, number];
  tracks: string[];
}

interface ArtistSeed {
  name: string;
  genre: string;
  albums: AlbumSeed[];
}

// Invented artists and records, so the film can show a believable library without anyone's real artwork.
// The first album is the newest and is the one the film plays.
const ARTISTS: ArtistSeed[] = [
  {
    name: "Halcyon Drive",
    genre: "Synthwave",
    albums: [
      {
        name: "Afterglow Avenue",
        year: 2025,
        motif: "sun",
        hues: [18, 285],
        tracks: [
          "Afterglow",
          "Taillights",
          "Neon Rain on 9th",
          "Midnight Overpass",
          "Chrome Hearts",
          "Slow Lane Love",
          "Last Exit to Sunset",
          "Rearview",
        ],
      },
      {
        name: "Night Shift",
        year: 2022,
        motif: "grid",
        hues: [305, 250],
        tracks: [
          "Clock In",
          "Fluorescent",
          "Vending Machine Blues",
          "Parking Garage Kiss",
          "Overtime",
          "Breakroom Radio",
          "Clock Out",
          "Dawn Patrol",
        ],
      },
    ],
  },
  {
    name: "Mira Okafor",
    genre: "Soul",
    albums: [
      {
        name: "Slow Burn",
        year: 2024,
        motif: "rings",
        hues: [28, 345],
        tracks: [
          "Warm Hands",
          "Stay a While",
          "Candlelight Math",
          "Honest",
          "Lowkey Love",
          "Rainy Day Hymn",
          "Sugar on the Stairs",
          "Come Home Slow",
        ],
      },
      {
        name: "Honey & Smoke",
        year: 2021,
        motif: "waves",
        hues: [38, 12],
        tracks: [
          "Honey",
          "Smoke Rings",
          "Velvet Sundays",
          "Old Jazz Radio",
          "Bittersweet Hours",
          "Cedar",
          "Nightcap",
          "Lullaby for Grown-ups",
        ],
      },
    ],
  },
  {
    name: "The Velvet Tides",
    genre: "Indie Rock",
    albums: [
      {
        name: "Low Season",
        year: 2024,
        motif: "bauhaus",
        hues: [45, 200],
        tracks: [
          "Boardwalk Closed",
          "Salt in the Carpet",
          "Everyone Left in September",
          "Paper Umbrella",
          "Winter Rental",
          "Tidewater",
          "Gull Song",
          "Off Season Heart",
        ],
      },
      {
        name: "Salt Lines",
        year: 2021,
        motif: "waves",
        hues: [195, 225],
        tracks: [
          "High Water Mark",
          "Dockside Radio",
          "Anchor Tattoo",
          "Sleeping in the Car",
          "Lighthouse Keeper",
          "Undertow",
          "Fog Horn Lullaby",
          "Shoreline",
        ],
      },
    ],
  },
  {
    name: "Kasper Lind",
    genre: "Ambient",
    albums: [
      {
        name: "Hours Before Snow",
        year: 2022,
        motif: "eclipse",
        hues: [200, 230],
        tracks: ["First Frost", "Pale Light", "Breath on Glass", "Stillness Study", "Hours Before Snow", "Drift", "Quiet Engines", "Thaw"],
      },
      {
        name: "Glass Cathedral",
        year: 2019,
        motif: "rings",
        hues: [180, 260],
        tracks: ["Nave", "Stained Light", "Echo Chamber", "Vespers", "Choir of Wind", "Cold Stone", "Bell Tower", "Benediction"],
      },
    ],
  },
  {
    name: "Dae Rivera",
    genre: "Hip-Hop",
    albums: [
      {
        name: "Corner Store Philosophy",
        year: 2023,
        motif: "bauhaus",
        hues: [8, 215],
        tracks: [
          "Open 24 Hours",
          "Lottery Dreams",
          "Bodega Cat",
          "Rent Due",
          "Sunday Dinner",
          "Quarter Water",
          "Block Party Ghosts",
          "Walk Home Slow",
        ],
      },
      {
        name: "Gold Hour",
        year: 2021,
        motif: "sun",
        hues: [42, 10],
        tracks: ["Golden", "Fire Escape", "Summer Math", "Rooftop Cypher", "Old Sneakers", "Sirens Lullaby", "Radio Edit", "Last Light"],
      },
    ],
  },
  {
    name: "Ostara",
    genre: "Folk",
    albums: [
      {
        name: "Wildflower Radio",
        year: 2024,
        motif: "stripes",
        hues: [95, 40],
        tracks: [
          "Meadow Static",
          "Kettle Song",
          "Dandelion Clocks",
          "Porch Swing Weather",
          "Foxglove",
          "Letters to the Orchard",
          "Moth Wings",
          "Hum for the Hives",
        ],
      },
      {
        name: "Thistle & Bone",
        year: 2020,
        motif: "eclipse",
        hues: [330, 120],
        tracks: [
          "Thistle",
          "River Bones",
          "Candle Wax Hands",
          "The Long Field",
          "Hawthorn",
          "Mercy Road",
          "Raven's Ledger",
          "Salt the Earth",
        ],
      },
    ],
  },
  {
    name: "Lowlight Cinema",
    genre: "Electronic",
    albums: [
      {
        name: "Reel 2",
        year: 2025,
        motif: "grid",
        hues: [190, 280],
        tracks: [
          "Projector Hum",
          "Cue Marks",
          "Intermission",
          "Slow Zoom",
          "Title Sequence",
          "Dolly Shot",
          "Fade to Amber",
          "Credits Roll",
        ],
      },
      {
        name: "Dial Tone Dreams",
        year: 2022,
        motif: "stripes",
        hues: [265, 200],
        tracks: [
          "Busy Signal",
          "Payphone",
          "Voicemail Ghost",
          "Static Lullaby",
          "Area Code",
          "Operator",
          "Long Distance",
          "Hang Up Gently",
        ],
      },
    ],
  },
  {
    name: "Juno Park",
    genre: "Pop",
    albums: [
      {
        name: "Candy Static",
        year: 2024,
        motif: "bauhaus",
        hues: [325, 190],
        tracks: ["Sugar Rush", "Bubblegum Radio", "Sunday Crush", "Glitter Bomb", "Pink Noise", "Sweet Talker", "Roller Rink", "Pop Rocks"],
      },
      {
        name: "Sunroom Sessions",
        year: 2023,
        motif: "sun",
        hues: [48, 330],
        tracks: [
          "Morning Window",
          "Lemon Light",
          "Plant Parent",
          "Bare Feet",
          "Second Coffee",
          "Tiny Orchestra",
          "Afternoon Sun",
          "Hum Along",
        ],
      },
    ],
  },
  {
    name: "Noor Haddad Trio",
    genre: "Jazz",
    albums: [
      {
        name: "Quarter Notes",
        year: 2018,
        motif: "stripes",
        hues: [215, 30],
        tracks: [
          "Take the Long Way",
          "Café Rain",
          "Brushes",
          "Blue Lantern",
          "Walking Bass in D",
          "Late Set",
          "Smoke and Mirrors",
          "Last Call Waltz",
        ],
      },
      {
        name: "Blue Hour in Cairo",
        year: 2021,
        motif: "eclipse",
        hues: [210, 250],
        tracks: [
          "Blue Hour",
          "Khan el-Khalili",
          "Nile at Dusk",
          "Oud Prelude",
          "Rooftop Maqam",
          "Evening Prayer",
          "Tea & Tabla",
          "Moonrise Over Giza",
        ],
      },
    ],
  },
  {
    name: "Ember & Oak",
    genre: "Country",
    albums: [
      {
        name: "Porchlight",
        year: 2023,
        motif: "sun",
        hues: [24, 350],
        tracks: [
          "Porchlight",
          "Gravel Road Lullaby",
          "Whiskey Weather",
          "Screen Door",
          "Pickup Truck Prayer",
          "Fireflies in Jars",
          "County Line",
          "Home by Dark",
        ],
      },
      {
        name: "Smoke Signals",
        year: 2019,
        motif: "waves",
        hues: [14, 30],
        tracks: [
          "Smoke Signals",
          "Dust Devil",
          "Tin Roof Rain",
          "Barn Dance",
          "Hank's Guitar",
          "Cattle Call",
          "Wide Open",
          "Campfire Goodbye",
        ],
      },
    ],
  },
  {
    name: "Tessellate",
    genre: "Electronic",
    albums: [
      {
        name: "Fractal Lullaby",
        year: 2023,
        motif: "rings",
        hues: [165, 300],
        tracks: ["Iteration", "Mandelbrot Waltz", "Recursion", "Soft Machine", "Binary Sunrise", "Tessellation", "Lattice", "Sleep Mode"],
      },
      {
        name: "Modular Hearts",
        year: 2020,
        motif: "grid",
        hues: [140, 270],
        tracks: [
          "Patch Cable",
          "Oscillator Love",
          "Filter Sweep",
          "Gate & Trigger",
          "Sequence 7",
          "Analog Warmth",
          "Sample & Hold",
          "Power Down",
        ],
      },
    ],
  },
  {
    name: "Priya Shankar",
    genre: "Indie Pop",
    albums: [
      {
        name: "Paper Moons",
        year: 2025,
        motif: "eclipse",
        hues: [275, 35],
        tracks: [
          "Paper Moons",
          "Window Seat",
          "Origami Heart",
          "Chai at Midnight",
          "Orbit Me",
          "Small Talk Universe",
          "Glow Sticks",
          "Fold It Up",
        ],
      },
      {
        name: "Monsoon Letters",
        year: 2022,
        motif: "waves",
        hues: [205, 150],
        tracks: [
          "First Rain",
          "Dear Mumbai",
          "Umbrella Season",
          "Ink Stains",
          "Train Window",
          "Wet Pavement Waltz",
          "Postmarked",
          "Clear Skies Soon",
        ],
      },
    ],
  },
  {
    name: "Fenrir Rose",
    genre: "Metal",
    albums: [
      {
        name: "Black Tulip",
        year: 2024,
        motif: "eclipse",
        hues: [350, 330],
        tracks: [
          "Black Tulip",
          "Thorn Crown",
          "Iron Petals",
          "Wolf Hour",
          "Ashes in Bloom",
          "Velvet Hammer",
          "Cathedral of Teeth",
          "Rose Dies Last",
        ],
      },
      {
        name: "Iron Orchard",
        year: 2021,
        motif: "stripes",
        hues: [0, 20],
        tracks: [
          "Iron Orchard",
          "Rust Season",
          "Harvest of Nails",
          "Smelter Hymn",
          "Furnace Heart",
          "Blackened Boughs",
          "Anvil Lullaby",
          "Slag",
        ],
      },
    ],
  },
  {
    name: "Atlas Weather",
    genre: "Post-Rock",
    albums: [
      {
        name: "Clear Skies, Static",
        year: 2023,
        motif: "sun",
        hues: [205, 260],
        tracks: ["Pressure Drop", "Cirrus", "Barometer", "Long Wave", "Jet Stream", "Storm Cellar", "Calm Before", "Clear Skies, Static"],
      },
      {
        name: "Pressure Systems",
        year: 2020,
        motif: "bauhaus",
        hues: [215, 40],
        tracks: ["Front", "Isobar", "Gale Warning", "Low Tide of Sound", "Thunderhead", "Weathervane", "Squall Line", "Dew Point"],
      },
    ],
  },
];

// Original words for the song the film plays; the first line lands at 0:06.
const AFTERGLOW = [
  "Streetlights stretch across the dashboard",
  "Radio low and your window down",
  "We said we'd drive until the map runs out",
  "Now the city's just a hum behind us",
  "Chase the afterglow",
  "Don't let the night forget our names",
  "Chase the afterglow",
  "Every red light turns to gold",
  "Say it slow, say it like you mean it",
  "Say it like we've got all the time",
  "The sky is burning down to violet",
  "And I swear it's only us out here",
  "Chase the afterglow",
  "Don't let the night forget our names",
  "Chase the afterglow",
  "Till the sun comes up and takes it back",
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

/** Cover specs by album id, so the capture and the 3D scene draw the same art the app is told about. */
export function showcaseCovers(): Map<string, CoverSpec> {
  const covers = new Map<string, CoverSpec>();
  let index = 0;
  for (const artist of ARTISTS)
    for (const album of artist.albums) {
      covers.set(`al-${index}`, { title: album.name, artist: artist.name, motif: album.motif, hues: album.hues });
      index += 1;
    }
  return covers;
}

export function createShowcaseLibrary(): Library {
  const next = random(11);
  const artists: Artist[] = [];
  const albums: Album[] = [];
  const songs: Song[] = [];
  const lyrics: Library["lyrics"] = new Map();
  const created = Date.UTC(2026, 8, 1);

  for (const [a, seed] of ARTISTS.entries()) {
    const artist: Artist = { id: `ar-${a}`, name: seed.name, albumCount: seed.albums.length, coverArt: `ar-${a}`, album: [] };
    artists.push(artist);
    for (const albumSeed of seed.albums) {
      const albumIndex = albums.length;
      const album: Album = {
        id: `al-${albumIndex}`,
        name: albumSeed.name,
        artist: seed.name,
        artistId: artist.id,
        coverArt: `al-${albumIndex}`,
        year: albumSeed.year,
        genre: seed.genre,
        genres: [{ name: seed.genre }],
        // The first album is the newest; the rest trickle back a couple of days apart.
        created: new Date(created - albumIndex * 2 * 86_400_000).toISOString(),
        playCount: 20 + Math.floor(next() * 140),
        releaseTypes: ["album"],
        song: [],
      };
      for (const [t, title] of albumSeed.tracks.entries()) {
        const song: Song = {
          id: `so-${songs.length}`,
          title,
          album: album.name,
          albumId: album.id,
          artist: seed.name,
          artistId: artist.id,
          track: t + 1,
          discNumber: 1,
          parent: album.id,
          path: `${seed.name}/${album.name}/${String(t + 1).padStart(2, "0")} ${title}.flac`,
          samplingRate: 44100,
          channelCount: 2,
          year: album.year,
          genre: seed.genre,
          coverArt: album.coverArt,
          duration: 150 + Math.floor(next() * 190),
          bitRate: 1000,
          suffix: "flac",
          size: 28_000_000,
          playCount: Math.floor(next() * 90),
          created: album.created,
          replayGain: { trackGain: -6 - next() * 4, albumGain: -7, trackPeak: 0.98, albumPeak: 0.99 },
        };
        songs.push(song);
        album.song?.push(song);
      }
      album.songCount = album.song?.length ?? 0;
      album.duration = album.song?.reduce((sum, song) => sum + (song.duration ?? 0), 0);
      albums.push(album);
      artist.album?.push(album);
    }
  }

  // The hero song: 3:47, synced.
  const hero = songs[0] as Song;
  hero.duration = 227;
  lyrics.set(hero.id, { synced: true, line: AFTERGLOW.map((value, index) => ({ start: 6000 + index * 4200, value })) });

  const pick = (genres: string[], count: number, offset = 0): Song[] =>
    songs.filter((song) => genres.includes(song.genre ?? "")).slice(offset, offset + count);
  const lists: [string, Song[]][] = [
    ["Late Night Drive", [...pick(["Synthwave"], 12), ...pick(["Electronic"], 8)]],
    ["Morning Coffee", [...pick(["Soul"], 8), ...pick(["Folk"], 6), ...pick(["Jazz"], 6)]],
    ["Deep Focus", [...pick(["Ambient"], 10), ...pick(["Post-Rock"], 8)]],
    ["Run Faster", [...pick(["Pop"], 8), ...pick(["Hip-Hop"], 8), ...pick(["Metal"], 6)]],
    ["Sunday Slow", [...pick(["Folk"], 8, 4), ...pick(["Country"], 8)]],
    ["Favorites", songs.filter((_, index) => index % 7 === 0).slice(0, 28)],
  ];
  const playlists: Playlist[] = lists.map(([name, entry], index) => ({
    id: `pl-${index}`,
    name,
    songCount: entry.length,
    duration: entry.reduce((sum, song) => sum + (song.duration ?? 0), 0),
    owner: "demo",
    changed: new Date(created).toISOString(),
    entry,
  }));
  const recent = songs.slice(0, 24);
  playlists.push({
    id: "pl-smart",
    name: "Recently added",
    songCount: recent.length,
    duration: recent.reduce((sum, song) => sum + (song.duration ?? 0), 0),
    owner: "demo",
    readonly: true,
    changed: new Date(created).toISOString(),
    entry: recent,
  });

  return { artists, albums, songs, playlists, genres: [...new Set(ARTISTS.map((artist) => artist.genre))], lyrics };
}
