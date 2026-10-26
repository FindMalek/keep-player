import { type ComponentType, createElement, use } from "react";

/*
 * Each page group is its own chunk, loaded on first visit and preloaded on link intent (hover / focus), so most clicks
 * open an already-loaded page. The shell, sidebar and player bar stay in the main chunk.
 *
 * Pages aren't React.lazy: a lazy component suspends on its first render even when its chunk is already loaded, and
 * React then holds the reveal for its 300 ms suspense throttle, so every first visit to a page waited ~300 ms doing
 * nothing. `page()` renders straight away once the chunk is in and only suspends when it really isn't.
 */
const chunks = {
  browse: () => import("@/pages/browse"),
  albums: () => import("@/pages/albums"),
  detail: () => import("@/pages/detail"),
  folders: () => import("@/pages/folders"),
  search: () => import("@/pages/search"),
  history: () => import("@/pages/history"),
  stats: () => import("@/pages/stats"),
  lyrics: () => import("@/pages/lyrics"),
  settings: () => import("@/pages/settings"),
  moments: () => import("@/pages/moments"),
  import: () => import("@/pages/import"),
  doctor: () => import("@/pages/doctor"),
  upload: () => import("@/pages/upload"),
  listen: () => import("@/pages/listen"),
  // The queue, info and lyrics panels and the split layout they open in: not pages, but the same suspense trap made the
  // first panel of a session wait ~300 ms.
  panels: () => import("@/components/side-panels"),
  split: () => import("@/components/split-view"),
};

const SECTIONS: Record<string, keyof typeof chunks> = {
  "": "browse",
  albums: "albums",
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
  settings: "settings",
  moments: "moments",
  import: "import",
  doctor: "doctor",
  upload: "upload",
  listen: "listen",
  song: "moments",
};

type Chunk = keyof typeof chunks;
type Module<C extends Chunk> = Awaited<ReturnType<(typeof chunks)[C]>>;

const modules = new Map<Chunk, unknown>();
const loading = new Map<Chunk, Promise<unknown>>();

/** One promise per chunk (what `use` suspends on), and the module kept once it's in. */
function load(chunk: Chunk): Promise<unknown> {
  let promise = loading.get(chunk);
  if (!promise) {
    promise = chunks[chunk]().then((module) => {
      modules.set(chunk, module);
      return module;
    });
    loading.set(chunk, promise);
  }
  return promise;
}

function page<C extends Chunk, K extends keyof Module<C>>(chunk: C, name: K): Module<C>[K] {
  function Page(props: object) {
    const module = (modules.get(chunk) ?? use(load(chunk))) as Module<C>;
    return createElement(module[name] as ComponentType<object>, props);
  }
  return Page as Module<C>[K];
}

export const QueuePanel = page("panels", "QueuePanel");
export const InfoPanel = page("panels", "InfoPanel");
export const LyricsPanel = page("panels", "LyricsPanel");
export const SplitView = page("split", "SplitView");

/** As soon as something plays, a panel is one click (or `l`) away: don't wait for the idle preload. */
export const preloadPanels = (): void => {
  void load("panels");
  void load("split");
};

export function preloadRoute(path: string): void {
  const chunk = SECTIONS[path.split("/")[1] ?? ""];
  if (chunk) void load(chunk);
}

/** After the first page is up, fetch the remaining chunks (plus any `extra` ones) while the browser is idle. */
export function preloadAllRoutes(extra: (() => Promise<unknown>)[] = []): void {
  const run = () => {
    for (const chunk of Object.keys(chunks) as Chunk[]) void load(chunk);
    for (const more of extra) void more();
  };
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1000);
}

export const HomePage = page("browse", "HomePage");
export const AlbumsPage = page("albums", "AlbumsPage");
export const ArtistsPage = page("browse", "ArtistsPage");
export const SongsPage = page("browse", "SongsPage");
export const LikedPage = page("browse", "LikedPage");
export const GenresPage = page("browse", "GenresPage");
export const AlbumPage = page("detail", "AlbumPage");
export const ArtistPage = page("detail", "ArtistPage");
export const GenrePage = page("detail", "GenrePage");
export const PlaylistPage = page("detail", "PlaylistPage");
export const FoldersPage = page("folders", "FoldersPage");
export const SearchPage = page("search", "SearchPage");
export const HistoryPage = page("history", "HistoryPage");
export const StatsPage = page("stats", "StatsPage");
export const LyricsPage = page("lyrics", "LyricsPage");
export const SettingsPage = page("settings", "SettingsPage");
export const ImportPage = page("import", "ImportPage");
export const DoctorPage = page("doctor", "DoctorPage");
export const UploadPage = page("upload", "UploadPage");
export const ListenPage = page("listen", "ListenPage");
export const MomentsPage = page("moments", "MomentsPage");
export const SongLink = page("moments", "SongLink");
