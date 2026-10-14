import { type CSSProperties, lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AppSidebar } from "@/components/app-sidebar";
import { PageSlot, usePageHost } from "@/components/page-host";
import { type Panel, PlayerBar } from "@/components/player-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageScrollContext } from "@/lib/page-scroll";
import { currentSong, player, usePlayer } from "@/lib/player";
import { usePath } from "@/lib/router";
import { useCheckingSession, useUser } from "@/lib/subsonic";
import {
  AlbumPage,
  AlbumsPage,
  ArtistPage,
  ArtistsPage,
  FoldersPage,
  GenrePage,
  GenresPage,
  HomePage,
  PlaylistPage,
  preloadAllRoutes,
  SongsPage,
} from "@/routes";

// Signed-out visitors and the side panels are rare enough to load on demand.
const Login = lazy(() => import("@/components/login").then((module) => ({ default: module.Login })));
const SplitView = lazy(() => import("@/components/split-view").then((module) => ({ default: module.SplitView })));
const QueuePanel = lazy(() => import("@/components/side-panels").then((module) => ({ default: module.QueuePanel })));
const LyricsPanel = lazy(() => import("@/components/side-panels").then((module) => ({ default: module.LyricsPanel })));

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
    case "genre":
      return param ? <GenrePage key={param} name={param} /> : null;
    case "folders":
      return <FoldersPage key={param ?? "root"} id={param} />;
    case "playlist":
      return param ? <PlaylistPage key={param} id={param} /> : null;
    default:
      return <HomePage />;
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function App() {
  const user = useUser();
  const checkingSession = useCheckingSession();
  const [panel, setPanel] = useState<Panel>(null);
  const [searching, setSearching] = useState(false);
  const [searchLoaded, setSearchLoaded] = useState(false);
  if (searching && !searchLoaded) setSearchLoaded(true);
  const path = usePath();
  const hasTrack = usePlayer((state) => state.queue.current !== null);
  const nowPlaying = usePlayer(currentSong);
  const playing = usePlayer((state) => state.playing);
  const showPanel = panel !== null && hasTrack;
  const host = usePageHost();

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearching((value) => !value);
        return;
      }
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const actions: Record<string, () => void> = {
        " ": () => player.toggle(),
        ArrowRight: () => (event.shiftKey ? player.next() : player.seek(player.getPosition() + 5)),
        ArrowLeft: () => (event.shiftKey ? player.previous() : player.seek(player.getPosition() - 5)),
        m: player.toggleMute,
        s: player.toggleShuffle,
        r: player.cycleRepeat,
        q: () => setPanel((value) => (value === "queue" ? null : "queue")),
        l: () => setPanel((value) => (value === "lyrics" ? null : "lyrics")),
        "/": () => setSearching(true),
      };
      const action = actions[event.key];
      if (!action) return;
      // Space on a focused button would also "click" it; the shortcut wins.
      event.preventDefault();
      action();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        <SidebarProvider className="min-h-0 flex-1" style={{ "--sidebar-width": "200px" } as CSSProperties}>
          <AppSidebar path={path} onSearch={() => setSearching(true)} />
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
