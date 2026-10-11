import { useEffect, useState } from "react";
import { Login } from "./components/login";
import { PlayerBar, type Panel } from "./components/player-bar";
import { SearchPalette } from "./components/search-palette";
import { LyricsPanel, QueuePanel } from "./components/side-panels";
import { Sidebar } from "./components/sidebar";
import { player, usePlayer } from "./lib/player";
import { usePath } from "./lib/router";
import { loadCredentials } from "./lib/subsonic";
import { AlbumsPage, ArtistsPage, GenresPage, HomePage, SongsPage } from "./pages/browse";
import { AlbumPage, ArtistPage, GenrePage, PlaylistPage } from "./pages/detail";
import { FoldersPage } from "./pages/folders";

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
  const [signedIn, setSignedIn] = useState(() => loadCredentials() !== null);
  const [panel, setPanel] = useState<Panel>(null);
  const [searching, setSearching] = useState(false);
  const path = usePath();
  const state = usePlayer();

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
        ArrowRight: () => (event.shiftKey ? player.next() : player.seek(state.position + 5)),
        ArrowLeft: () => (event.shiftKey ? player.previous() : player.seek(state.position - 5)),
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
  }, [state.position]);

  useEffect(() => {
    const song = state.queue[state.index];
    document.title = song && state.playing ? `${song.title} · ${song.artist ?? ""}` : "keep music";
  }, [state.queue, state.index, state.playing]);

  if (!signedIn) return <Login onDone={() => setSignedIn(true)} />;

  const hasTrack = state.index >= 0 && state.queue.length > 0;
  return (
    <div className={`shell${hasTrack ? " with-player" : ""}${panel && hasTrack ? " with-panel" : ""}`}>
      <Sidebar path={path} onSearch={() => setSearching(true)} />
      <main className="page">
        <Page path={path} />
      </main>
      {panel === "queue" && hasTrack && <QueuePanel onClose={() => setPanel(null)} />}
      {panel === "lyrics" && hasTrack && <LyricsPanel onClose={() => setPanel(null)} />}
      <PlayerBar panel={panel} onPanel={setPanel} />
      {searching && <SearchPalette onClose={() => setSearching(false)} />}
    </div>
  );
}
