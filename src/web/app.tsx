import { type CSSProperties, lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NowPlayingAnnouncer } from "@/components/announcer";
import { AppSidebar } from "@/components/app-sidebar";
import { ChordHint } from "@/components/chord-hint";
import { PageSlot, usePageHost } from "@/components/page-host";
import { type Panel, PlayerBar } from "@/components/player-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadLikes, toggleLiked } from "@/lib/likes";
import { openListFilter } from "@/lib/list-filter";
import { runListCommand } from "@/lib/list-nav";
import { notify } from "@/lib/notify";
import { PageScrollContext } from "@/lib/page-scroll";
import { currentSong, player, usePlayer } from "@/lib/player";
import { go, usePath } from "@/lib/router";
import { installShortcuts, useShortcuts } from "@/lib/shortcuts";
import { useCheckingSession, useUser } from "@/lib/subsonic";
import { welcomeTip } from "@/lib/tips";
import {
  AlbumPage,
  AlbumsPage,
  ArtistPage,
  ArtistsPage,
  FoldersPage,
  GenrePage,
  GenresPage,
  HomePage,
  LikedPage,
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
const LyricsPanel = lazy(() => import("@/components/side-panels").then((module) => ({ default: module.LyricsPanel })));

const NowPlayingFull = lazy(() => import("@/components/now-playing-full").then((module) => ({ default: module.NowPlayingFull })));
const CheatSheet = lazy(() => import("@/components/cheat-sheet").then((module) => ({ default: module.CheatSheet })));

// Only loaded on the first ⌘K (cmdk + dialog stay out of the first paint), then kept mounted.
const SearchPalette = lazy(() => import("@/components/search-palette").then((module) => ({ default: module.SearchPalette })));

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
    default:
      return <HomePage />;
  }
}

installShortcuts();

export function App() {
  const user = useUser();
  const checkingSession = useCheckingSession();
  const [panel, setPanel] = useState<Panel>(null);
  const [searching, setSearching] = useState(false);
  const [cheatSheet, setCheatSheet] = useState(false);
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
      likeCurrent: () => {
        const song = currentSong(player.getState());
        if (song) void toggleLiked("song", song.id, song.title);
      },
    }),
  );

  useEffect(() => {
    if (user) void loadLikes();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const id = setTimeout(() => welcomeTip(() => setCheatSheet(true)), 4000);
    return () => clearTimeout(id);
  }, [user]);

  useEffect(() => {
    if (user)
      preloadAllRoutes([
        () => import("@/components/split-view"),
        () => import("@/components/side-panels"),
        () => import("@/components/user-menu"),
      ]);
  }, [user]);

  useEffect(() => {
    document.title = nowPlaying && playing ? `${nowPlaying.title} · ${nowPlaying.artist ?? ""}` : "keep music";
  }, [nowPlaying, playing]);

  if (checkingSession) return null;
  if (!user)
    return (
      <Suspense>
        <Login />
      </Suspense>
    );

  return (
    <TooltipProvider delay={400}>
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
                    <Suspense>
                      {panel === "queue" ? <QueuePanel onClose={() => setPanel(null)} /> : <LyricsPanel onClose={() => setPanel(null)} />}
                    </Suspense>
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
      {cheatSheet && (
        <Suspense>
          <CheatSheet open={cheatSheet} onOpenChange={setCheatSheet} />
        </Suspense>
      )}
      {createPortal(
        <PageScrollContext.Provider value={host}>
          <Suspense>
            <Page path={path} />
          </Suspense>
        </PageScrollContext.Provider>,
        host,
      )}
      {(searching || searchLoaded) && (
        <Suspense>
          <SearchPalette open={searching} onOpenChange={setSearching} />
        </Suspense>
      )}
    </TooltipProvider>
  );
}
