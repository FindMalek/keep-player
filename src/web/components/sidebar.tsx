import { useState } from "react";
import { navigate } from "../lib/router";
import { api, currentUser, logout } from "../lib/subsonic";
import type { Playlist } from "../lib/types";
import { useQuery } from "../lib/use-query";
import { Search } from "./icons";

const LIBRARY = [
  ["/", "home"],
  ["/albums", "albums"],
  ["/artists", "artists"],
  ["/songs", "songs"],
  ["/genres", "genres"],
  ["/folders", "folders"],
] as const;

interface FolderNode {
  name: string;
  path: string;
  folders: Map<string, FolderNode>;
  playlists: Playlist[];
}

/** Playlists named "Chill / Night" are shown inside a "Chill" folder; Subsonic has no real playlist folders. */
function tree(playlists: Playlist[]): FolderNode {
  const root: FolderNode = { name: "", path: "", folders: new Map(), playlists: [] };
  for (const playlist of playlists) {
    const parts = playlist.name.split(" / ");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      const path = `${node.path}/${part}`;
      if (!node.folders.has(part)) node.folders.set(part, { name: part, path, folders: new Map(), playlists: [] });
      node = node.folders.get(part) as FolderNode;
    }
    node.playlists.push(playlist);
  }
  return root;
}

function FolderView({ node, path, depth }: { node: FolderNode; path: string; depth: number }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <>
      {[...node.folders.values()].map((folder) => (
        <li key={folder.path}>
          <button
            type="button"
            className="nav-item nav-folder"
            style={{ paddingLeft: 10 + depth * 12 }}
            onClick={() => setOpen((current) => ({ ...current, [folder.path]: !current[folder.path] }))}
            aria-expanded={Boolean(open[folder.path])}
          >
            <span className="folder-caret" aria-hidden="true">
              {open[folder.path] ? "▾" : "▸"}
            </span>
            {folder.name}
          </button>
          {open[folder.path] && (
            <ul>
              <FolderView node={folder} path={path} depth={depth + 1} />
            </ul>
          )}
        </li>
      ))}
      {node.playlists.map((playlist) => {
        const href = `/playlist/${playlist.id}`;
        return (
          <li key={playlist.id}>
            <a
              href={href}
              className="nav-item"
              style={{ paddingLeft: 10 + depth * 12 }}
              aria-current={path === href ? "page" : undefined}
              onClick={navigate}
            >
              <span className="ellipsis">{playlist.name.split(" / ").at(-1)}</span>
            </a>
          </li>
        );
      })}
    </>
  );
}

export function Sidebar({ path, onSearch }: { path: string; onSearch: () => void }) {
  const { data } = useQuery("playlists", () => api<{ playlists: { playlist?: Playlist[] } }>("getPlaylists"));
  const playlists = (data?.playlists.playlist ?? []).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <nav className="sidebar" aria-label="library">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        keep music
      </div>
      <button type="button" className="search-button" onClick={onSearch}>
        <Search />
        <span>search</span>
        <kbd>⌘K</kbd>
      </button>

      <span className="nav-label">library</span>
      <ul>
        {LIBRARY.map(([href, label]) => (
          <li key={href}>
            <a
              href={href}
              className="nav-item"
              aria-current={(href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined}
              onClick={navigate}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>

      <span className="nav-label">playlists</span>
      <ul className="nav-playlists">
        {playlists.length === 0 ? <li className="nav-empty">none yet</li> : <FolderView node={tree(playlists)} path={path} depth={0} />}
      </ul>

      <div className="sidebar-foot">
        <span className="muted ellipsis">{currentUser()}</span>
        <button type="button" className="text-button" onClick={logout}>
          log out
        </button>
      </div>
    </nav>
  );
}
