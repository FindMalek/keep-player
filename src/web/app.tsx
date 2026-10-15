import { useIsFetching } from "@tanstack/react-query";
import { type CSSProperties, lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NowPlayingAnnouncer } from "@/components/announcer";
import { AppSidebar } from "@/components/app-sidebar";
import { ChordHint } from "@/components/chord-hint";
import { PageSlot, usePageHost } from "@/components/page-host";
import { type Panel, PlayerBar } from "@/components/player-bar";
import { RouteBoundary } from "@/components/route-boundary";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { startElsewhere } from "@/lib/elsewhere";
import { loadLikes, toggleLiked } from "@/lib/likes";
import { openListFilter } from "@/lib/list-filter";
import { runListCommand } from "@/lib/list-nav";
import { startListeningHistory } from "@/lib/listening";
import { openMiniPlayer, setAutoMiniPlayer, useMiniWindow } from "@/lib/mini-player";
import { transition } from "@/lib/motion";
import { notify } from "@/lib/notify";
import { PageScrollContext } from "@/lib/page-scroll";
import { currentSong, player, usePlayer } from "@/lib/player";
import { openPlaylistDialog, usePlaylistDialog } from "@/lib/playlist-dialogs";
import { useReachability } from "@/lib/reachability";
import { go, usePath } from "@/lib/router";
import { useSetting } from "@/lib/settings";
import { installShortcuts, useShortcuts } from "@/lib/shortcuts";
import { useCheckingSession, useUser } from "@/lib/subsonic";
import { isOnboarded, welcomeTip } from "@/lib/tips";
import { loadTooltips } from "@/lib/tooltips";
import { redo, undo } from "@/lib/undo";
import {
  AlbumPage,
  AlbumsPage,
  ArtistPage,
  ArtistsPage,
  FoldersPage,
  GenrePage,
  GenresPage,
  HistoryPage,
  HomePage,
  LikedPage,
  LyricsPage,
  PlaylistPage,
  preloadAllRoutes,
  SearchPage,
  SongsPage,
} from "@/routes";
import { appShortcuts } from "./app-shortcuts";

// Signed-out visitors and the side panels are rare enough to load on demand.
const Login = lazy(() => import("@/components/login").then((module) => ({ default: module.Login })));
const SplitView = lazy(() => import("@/components/split-view").then((module) => ({ default: module.SplitView })));
const QueuePanel = lazy(() => import("@/components/side-panels").then((module) => ({ default: module.QueuePanel })));
const InfoPanel = lazy(() => import("@/components/side-panels").then((module) => ({ default: module.InfoPanel })));
const LyricsPanel = lazy(() => import("@/components/side-panels").then((module) => ({ default: module.LyricsPanel })));

const NowPlayingFull = lazy(() => import("@/components/now-playing-full").then((module) => ({ default: module.NowPlayingFull })));
const FirstRun = lazy(() => import("@/components/first-run").then((module) => ({ default: module.FirstRun })));
const CheatSheet = lazy(() => import("@/components/cheat-sheet").then((module) => ({ default: module.CheatSheet })));

// Only loaded on the first ⌘K (cmdk + dialog stay out of the first paint), then kept mounted.
const SearchPalette = lazy(() => import("@/components/search-palette").then((module) => ({ default: module.SearchPalette })));

const PlaylistDialogs = lazy(() => import("@/components/playlist-dialogs").then((module) => ({ default: module.PlaylistDialogs })));
const MiniPlayerPortal = lazy(() => import("@/components/mini-player").then((module) => ({ default: module.MiniPlayerPortal })));
const OfflineBanner = lazy(() => import("@/components/offline-banner").then((module) => ({ default: module.OfflineBanner })));
const TopProgressLine = lazy(() => import("@/components/top-progress").then((module) => ({ default: module.TopProgressLine })));

/**
 * Revisits paint from the persisted cache and refresh in the background; only a refresh slower than 300 ms gets the
 * line at the top. First loads have skeletons instead, so they don't count.
 */
function TopProgress() {
  const refreshing = useIsFetching({ predicate: (query) => query.state.data !== undefined }) > 0;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!refreshing) return setShown(false);
    const id = setTimeout(() => setShown(true), 300);
    return () => clearTimeout(id);
  }, [refreshing]);
  return shown ? (
    <Suspense>
      <TopProgressLine />
    </Suspense>
  ) : null;
}

/** The tab icon from the theme's own tokens (a square in the text color, the glyph in the page color). */
function tabIcon(playing: boolean): string {
  const tokens = getComputedStyle(document.documentElement);
  const square = tokens.getPropertyValue("--foreground").trim();
  const glyph = tokens.getPropertyValue("--background").trim();
  const shape = playing ? "M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" : "M5 3.5v9l7-4.5z";
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${square}"/><path d="${shape}" fill="${glyph}"/></svg>`,
  )}`;
}

function Page({ path }: { path: string }) {
  const [, section, id] = path.split("/");
  const param = id ? decodeURIComponent(id) : null;
  switch (section) {
    case "albums":
      return <AlbumsPage />;
    case "album":
      return param ? <AlbumPage key={param} id={param} /> : null;
    case "artists":
      return <ArtistsPage />;
    case "artist":
      return param ? <ArtistPage key={param} id={param} /> : null;
    case "songs":
      return <SongsPage />;
    case "genres":
      return <GenresPage />;
    case "liked":
      return <LikedPage />;
    case "genre":
      return param ? <GenrePage key={param} name={param} /> : null;
    case "folders":
      return <FoldersPage key={param ?? "root"} id={param} />;
    case "playlist":
      return param ? <PlaylistPage key={param} id={param} /> : null;
    case "search":
      return <SearchPage />;
    case "history":
      return <HistoryPage />;
    case "lyrics":
      return <LyricsPage />;
    default:
      return <HomePage />;
  }
}

installShortcuts();

export function App() {
  const user = useUser();
  const checkingSession = useCheckingSession();
  const { unreachable } = useReachability();
  const [panel, setPanelNow] = useState<Panel>(null);
  // Panels slide in and out as a view transition (app.css), the page reflows under a cross-fade.
  const setPanel = (update: Panel | ((value: Panel) => Panel)) => transition(() => setPanelNow(update));
  const reduceMotion = useSetting("reduceMotion");
  const miniWindow = useMiniWindow();
  const playlistDialog = usePlaylistDialog();
  const autoMini = useSetting("miniPlayerWhenHidden");
  useEffect(() => setAutoMiniPlayer(autoMini), [autoMini]);
  useEffect(() => {
    document.documentElement.dataset.motion = reduceMotion ? "reduce" : "system";
  }, [reduceMotion]);
  const [searching, setSearching] = useState(false);
  const [cheatSheet, setCheatSheet] = useState(false);
  // First sign-in in this browser: a short setup and tour, once.
  const [firstRun, setFirstRun] = useState(() => !isOnboarded());
  const [fullScreen, setFullScreen] = useState(false);
  const [searchLoaded, setSearchLoaded] = useState(false);
  if (searching && !searchLoaded) setSearchLoaded(true);
  const path = usePath();
  const hasTrack = usePlayer((state) => state.queue.current !== null);
  const nowPlaying = usePlayer(currentSong);
  const playing = usePlayer((state) => state.playing);
  const showPanel = panel !== null && hasTrack;
  const host = usePageHost();

  useShortcuts(() =>
    appShortcuts({
      player,
      go,
      notify,
      runListCommand,
      togglePanel: (next) => setPanel((value) => (value === next ? null : next)),
      closeTopLayer: () => setPanel(null),
      openSearch: () => setSearching(true),
      toggleSearch: () => setSearching((value) => !value),
      openCheatSheet: () => setCheatSheet(true),
      toggleFullScreen: () => setFullScreen((value) => !value),
      findInList: openListFilter,
      openMiniPlayer: () => void openMiniPlayer(),
      newPlaylist: () => openPlaylistDialog({ kind: "new" }),
      undo: () => void undo(),
      redo: () => void redo(),
      likeCurrent: () => {
        const song = currentSong(player.getState());
        if (song) void toggleLiked("song", song.id, song.title);
      },
    }),
  );

  useEffect(() => {
    if (!user) return;
    void loadLikes();
    startListeningHistory();
    // The queue hand-off (Arpeggi, other browsers) waits until the first screen is done.
    const id = setTimeout(() => {
      void import("@/lib/queue-sync").then((sync) => sync.startQueueSync());
      startElsewhere();
    }, 1500);
    return () => clearTimeout(id);
  }, [user]);

  useEffect(() => {
    if (!user || firstRun) return;
    const id = setTimeout(() => welcomeTip(() => setCheatSheet(true)), 4000);
    return () => clearTimeout(id);
  }, [user, firstRun]);

  useEffect(() => {
    if (user)
      preloadAllRoutes([
        () => import("@/components/split-view"),
        () => import("@/components/side-panels"),
        () => import("@/components/user-menu"),
        () => import("@/components/now-playing-details"),
        () => import("@/components/artist-card"),
      ]);
    // Tooltips too (lib/tooltips): off the first screen, ready long before most people hover.
    if (user) requestIdleCallback?.(loadTooltips, { timeout: 4000 });
  }, [user]);

  useEffect(() => {
    document.title = nowPlaying && playing ? `▶ ${nowPlaying.title} · ${nowPlaying.artist ?? ""}` : "keep music";
    // The tab icon says it too: pause bars while playing (click it to pause), the play mark otherwise.
    const icon = document.querySelector<HTMLLinkElement>("link[rel=icon]");
    if (icon) icon.href = tabIcon(playing);
  }, [nowPlaying, playing]);

  if (checkingSession) return null;
  if (!user)
    return (
      <Suspense>
        <Login />
      </Suspense>
    );

  return (
    <>
      <TopProgress />
      {playlistDialog && (
        <Suspense>
          <PlaylistDialogs
            key={playlistDialog.kind === "new" ? `new:${playlistDialog.folder ?? ""}` : `folder:${playlistDialog.path}`}
            dialog={playlistDialog}
          />
        </Suspense>
      )}
      {miniWindow && (
        <Suspense>
          <MiniPlayerPortal target={miniWindow} />
        </Suspense>
      )}
      {unreachable && (
        <Suspense>
          <OfflineBanner />
        </Suspense>
      )}
      <div className="flex h-svh flex-col" style={{ "--bar-height": hasTrack ? "4rem" : "0px" } as CSSProperties}>
        {/* First tab stop: straight to the page, past the sidebar. */}
        <a
          href="#content"
          className="sr-only z-50 bg-background px-3 py-2 font-mono text-xs focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:border"
        >
          skip to content
        </a>
        <SidebarProvider className="min-h-0 flex-1" style={{ "--sidebar-width": "200px" } as CSSProperties}>
          <AppSidebar path={path} onSearch={() => setSearching(true)} onShortcuts={() => setCheatSheet(true)} />
          <SidebarInset className="min-h-0 min-w-0">
            {showPanel ? (
              <Suspense fallback={<PageSlot host={host} />}>
                <SplitView
                  host={host}
                  side={
                    <div className="h-full" style={{ viewTransitionName: "side-panel" }}>
                      <Suspense>
                        {panel === "queue" ? (
                          <QueuePanel onClose={() => setPanel(null)} />
                        ) : panel === "info" ? (
                          <InfoPanel onClose={() => setPanel(null)} />
                        ) : (
                          <LyricsPanel onClose={() => setPanel(null)} />
                        )}
                      </Suspense>
                    </div>
                  }
                />
              </Suspense>
            ) : (
              <PageSlot host={host} />
            )}
          </SidebarInset>
        </SidebarProvider>
        <PlayerBar panel={panel} onPanel={setPanel} />
      </div>
      <ChordHint />
      <NowPlayingAnnouncer />
      {fullScreen && (
        <Suspense>
          <NowPlayingFull open={fullScreen} onOpenChange={setFullScreen} />
        </Suspense>
      )}
      {firstRun && (
        <Suspense>
          <FirstRun onDone={() => setFirstRun(false)} />
        </Suspense>
      )}
      {cheatSheet && (
        <Suspense>
          <CheatSheet open={cheatSheet} onOpenChange={setCheatSheet} />
        </Suspense>
      )}
      {createPortal(
        <PageScrollContext.Provider value={host}>
          <RouteBoundary key={path} path={path}>
            <Suspense>
              <Page path={path} />
            </Suspense>
          </RouteBoundary>
        </PageScrollContext.Provider>,
        host,
      )}
      {(searching || searchLoaded) && (
        <Suspense>
          <SearchPalette open={searching} onOpenChange={setSearching} />
        </Suspense>
      )}
    </>
  );
}
