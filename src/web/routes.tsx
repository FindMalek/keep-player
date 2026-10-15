import { lazy } from "react";

/*
 * Each page group is its own chunk, loaded on first visit and preloaded on link intent (hover / focus), so most clicks
 * open an already-loaded page. The shell, sidebar and player bar stay in the main chunk.
 */
const chunks = {
  browse: () => import("@/pages/browse"),
  detail: () => import("@/pages/detail"),
  folders: () => import("@/pages/folders"),
  search: () => import("@/pages/search"),
  history: () => import("@/pages/history"),
  stats: () => import("@/pages/stats"),
  lyrics: () => import("@/pages/lyrics"),
};

const SECTIONS: Record<string, keyof typeof chunks> = {
  "": "browse",
  albums: "browse",
  artists: "browse",
  songs: "browse",
  genres: "browse",
  liked: "browse",
  album: "detail",
  artist: "detail",
  genre: "detail",
  playlist: "detail",
  folders: "folders",
  search: "search",
  history: "history",
  stats: "stats",
  lyrics: "lyrics",
};

export function preloadRoute(path: string): void {
  const chunk = SECTIONS[path.split("/")[1] ?? ""];
  if (chunk) void chunks[chunk]();
}

/** After the first page is up, fetch the remaining chunks (plus any `extra` ones) while the browser is idle. */
export function preloadAllRoutes(extra: (() => Promise<unknown>)[] = []): void {
  const run = () => {
    for (const load of [...Object.values(chunks), ...extra]) void load();
  };
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1000);
}

export const HomePage = lazy(() => chunks.browse().then((module) => ({ default: module.HomePage })));
export const AlbumsPage = lazy(() => chunks.browse().then((module) => ({ default: module.AlbumsPage })));
export const ArtistsPage = lazy(() => chunks.browse().then((module) => ({ default: module.ArtistsPage })));
export const SongsPage = lazy(() => chunks.browse().then((module) => ({ default: module.SongsPage })));
export const LikedPage = lazy(() => chunks.browse().then((module) => ({ default: module.LikedPage })));
export const GenresPage = lazy(() => chunks.browse().then((module) => ({ default: module.GenresPage })));
export const AlbumPage = lazy(() => chunks.detail().then((module) => ({ default: module.AlbumPage })));
export const ArtistPage = lazy(() => chunks.detail().then((module) => ({ default: module.ArtistPage })));
export const GenrePage = lazy(() => chunks.detail().then((module) => ({ default: module.GenrePage })));
export const PlaylistPage = lazy(() => chunks.detail().then((module) => ({ default: module.PlaylistPage })));
export const FoldersPage = lazy(() => chunks.folders().then((module) => ({ default: module.FoldersPage })));
export const SearchPage = lazy(() => chunks.search().then((module) => ({ default: module.SearchPage })));
export const HistoryPage = lazy(() => chunks.history().then((module) => ({ default: module.HistoryPage })));
export const StatsPage = lazy(() => chunks.stats().then((module) => ({ default: module.StatsPage })));
export const LyricsPage = lazy(() => chunks.lyrics().then((module) => ({ default: module.LyricsPage })));
