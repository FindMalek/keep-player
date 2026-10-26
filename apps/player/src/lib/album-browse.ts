import type { Album } from "./types";

export const ALBUM_SORTS = [
  ["newest", "recently added"],
  ["name", "a–z"],
  ["artist", "artist"],
  ["year", "year"],
  ["plays", "most played"],
  ["random", "random"],
] as const;
export type AlbumSort = (typeof ALBUM_SORTS)[number][0];

export interface AlbumFilter {
  genre: string;
  /** Inclusive; 0 = open. */
  fromYear: number;
  toYear: number;
  unplayed: boolean;
  liked: boolean;
}

export const NO_FILTER: AlbumFilter = { genre: "", fromYear: 0, toYear: 0, unplayed: false, liked: false };

export const isFiltering = (filter: AlbumFilter): boolean =>
  Boolean(filter.genre || filter.fromYear || filter.toYear || filter.unplayed || filter.liked);

const text = (value?: string) => value ?? "";
const byText = (a?: string, b?: string) => text(a).localeCompare(text(b), undefined, { sensitivity: "base", numeric: true });

/** What the server can sort for us; the rest is sorted here once every page is loaded. */
export const SERVER_TYPE: Partial<Record<AlbumSort, string>> = {
  newest: "newest",
  name: "alphabeticalByName",
  artist: "alphabeticalByArtist",
  plays: "frequent",
};

function genresOf(album: Album): string[] {
  return album.genres?.map((genre) => genre.name) ?? (album.genre ? [album.genre] : []);
}

export function matches(album: Album, filter: AlbumFilter): boolean {
  if (filter.genre && !genresOf(album).some((genre) => genre.toLowerCase() === filter.genre.toLowerCase())) return false;
  if (filter.fromYear && (album.year ?? 0) < filter.fromYear) return false;
  if (filter.toYear && (!album.year || album.year > filter.toYear)) return false;
  if (filter.unplayed && (album.playCount ?? 0) > 0) return false;
  if (filter.liked && !album.starred) return false;
  return true;
}

/** `random` takes the shuffle function so the order only changes when asked to. */
export function sortAlbums(albums: Album[], sort: AlbumSort, random: () => number = Math.random): Album[] {
  const sorted = [...albums];
  switch (sort) {
    case "name":
      return sorted.sort((a, b) => byText(a.name, b.name));
    case "artist":
      return sorted.sort((a, b) => byText(a.artist, b.artist) || (a.year ?? 0) - (b.year ?? 0));
    case "year":
      return sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || byText(a.name, b.name));
    case "plays":
      return sorted.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
    case "newest":
      return sorted.sort((a, b) => text(b.created).localeCompare(text(a.created)));
    case "random":
      return sorted
        .map((album) => ({ album, key: random() }))
        .sort((a, b) => a.key - b.key)
        .map(({ album }) => album);
  }
}

export type ReleaseKind = "album" | "ep" | "single" | "compilation" | "live" | "other";

const RELEASE_ORDER: [ReleaseKind, string][] = [
  ["album", "albums"],
  ["ep", "EPs"],
  ["single", "singles"],
  ["live", "live"],
  ["compilation", "compilations"],
  ["other", "other"],
];

export function releaseKind(album: Album): ReleaseKind {
  const types = (album.releaseTypes ?? []).map((type) => type.toLowerCase());
  if (album.isCompilation || types.includes("compilation")) return "compilation";
  if (types.includes("live")) return "live";
  if (types.includes("single")) return "single";
  if (types.includes("ep")) return "ep";
  if (types.includes("album") || types.length === 0) return "album";
  return "other";
}

export function groupByRelease(albums: Album[]): { kind: ReleaseKind; title: string; albums: Album[] }[] {
  const groups = new Map<ReleaseKind, Album[]>();
  for (const album of albums) groups.set(releaseKind(album), [...(groups.get(releaseKind(album)) ?? []), album]);
  return RELEASE_ORDER.flatMap(([kind, title]) => {
    const items = groups.get(kind);
    return items ? [{ kind, title, albums: items.sort((a, b) => (b.year ?? 0) - (a.year ?? 0)) }] : [];
  });
}

export function discStarts(songs: { discNumber?: number }[]): { disc: number; index: number }[] {
  const starts: { disc: number; index: number }[] = [];
  songs.forEach((song, index) => {
    const disc = song.discNumber ?? 1;
    if (!starts.some((start) => start.disc === disc)) starts.push({ disc, index });
  });
  return starts.length > 1 ? starts : [];
}

export function topArtists(albums: Album[], limit = 12): { id: string; name: string; albums: number }[] {
  const byArtist = new Map<string, { id: string; name: string; albums: number }>();
  for (const album of albums) {
    if (!album.artistId) continue;
    const entry = byArtist.get(album.artistId) ?? { id: album.artistId, name: album.artist ?? "", albums: 0 };
    entry.albums += 1;
    byArtist.set(album.artistId, entry);
  }
  return [...byArtist.values()].sort((a, b) => b.albums - a.albums || byText(a.name, b.name)).slice(0, limit);
}

export function topSongs<T extends { playCount?: number }>(songs: T[], limit = 20): T[] {
  return [...songs].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0)).slice(0, limit);
}
