import { useQuery } from "@tanstack/react-query";
import {
  BookmarkIcon,
  ChartColumnIcon,
  ChevronRightIcon,
  Disc3Icon,
  EllipsisIcon,
  FolderIcon,
  HeartIcon,
  HistoryIcon,
  HouseIcon,
  ListMusicIcon,
  MusicIcon,
  PlusIcon,
  TagIcon,
  UsersIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { current as currentDrag, dropFailed, dropSongs, endDrag, leftTarget } from "@/lib/drag";
import { useElsewhere } from "@/lib/elsewhere";
import { usePlayer } from "@/lib/player";
import { openPlaylistDialog } from "@/lib/playlist-dialogs";
import { queries } from "@/lib/queries";
import { useUser } from "@/lib/subsonic";
import type { Playlist } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand";
import { Equalizer } from "./equalizer";
import { Link } from "./link";

const ElsewhereBadge = lazy(() => import("./elsewhere-badge").then((module) => ({ default: module.ElsewhereBadge })));
// Right-clicking a playlist loads the shared item menu then (menus stay off the first screen).
const PointMenu = lazy(() => import("./item-menu").then((module) => ({ default: module.PointMenu })));

const LIBRARY = [
  ["/", "home", HouseIcon],
  ["/albums", "albums", Disc3Icon],
  ["/artists", "artists", UsersIcon],
  ["/songs", "songs", MusicIcon],
  ["/liked", "liked songs", HeartIcon],
  ["/history", "history", HistoryIcon],
  ["/moments", "moments", BookmarkIcon],
  ["/stats", "stats", ChartColumnIcon],
  ["/genres", "genres", TagIcon],
  ["/folders", "folders", FolderIcon],
] as const;

const LABEL = "font-mono text-[10.5px] text-faint";

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
    let node = root;
    for (const part of playlist.name.split(" / ").slice(0, -1)) {
      const path = `${node.path}/${part}`;
      if (!node.folders.has(part)) node.folders.set(part, { name: part, path, folders: new Map(), playlists: [] });
      node = node.folders.get(part) as FolderNode;
    }
    node.playlists.push(playlist);
  }
  return root;
}

/** The tree's "/A/B" as the "A / B" that starts the playlist names inside. */
const playlistPrefix = (path: string) => path.replace(/^\//, "").split("/").join(" / ");

function SubTree({ node, path, dropId }: { node: FolderNode; path: string; dropId: string | null }) {
  // The playlist the queue came from, so you can see what's playing without opening it.
  const playingHref = usePlayer((state) => (state.queue.context.source?.kind === "playlist" ? state.queue.context.source.href : undefined));
  const playing = usePlayer((state) => state.playing);
  return (
    <>
      {[...node.folders.values()].map((folder) => (
        <Collapsible key={folder.path} render={<SidebarMenuSubItem />}>
          {/* The trigger is a button (it expands a folder); the sub-button's default would be a link. */}
          <SidebarMenuSubButton
            render={<CollapsibleTrigger />}
            className="w-full font-mono text-muted-foreground [&[data-panel-open]>svg]:rotate-90"
          >
            <ChevronRightIcon className="transition-transform" />
            <span>{folder.name}</span>
          </SidebarMenuSubButton>
          <button
            type="button"
            aria-label={`folder ${playlistPrefix(folder.path)}: rename or add a playlist`}
            className="absolute top-1 right-1 grid size-5 place-items-center text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/menu-sub-item:opacity-100"
            onClick={() => openPlaylistDialog({ kind: "folder", path: playlistPrefix(folder.path) })}
          >
            <EllipsisIcon className="size-3.5" />
          </button>
          <CollapsibleContent>
            <SidebarMenuSub className="mr-0 pr-0">
              <SubTree node={folder} path={path} dropId={dropId} />
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      ))}
      {node.playlists.map((playlist) => {
        const href = `/playlist/${playlist.id}`;
        return (
          <SidebarMenuSubItem
            key={playlist.id}
            data-playlist-id={playlist.id}
            data-drop-target={dropId === playlist.id || undefined}
            className="data-drop-target:bg-sidebar-accent data-drop-target:outline data-drop-target:outline-foreground"
          >
            <SidebarMenuSubButton
              isActive={path === href}
              className={cn("font-mono text-muted-foreground", playingHref === href && "text-foreground")}
              render={<Link href={href} />}
            >
              <span>{playlist.name.split(" / ").at(-1)}</span>
              {playingHref === href && <Equalizer playing={playing} />}
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        );
      })}
    </>
  );
}

export function AppSidebar({ path }: { path: string }) {
  const user = useUser() ?? "";
  const elsewhere = useElsewhere();
  // Dragging songs, an album or a playlist over a playlist you can edit adds them to it on drop.
  const [dropId, setDropId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ target: { kind: "playlist"; playlist: Playlist }; x: number; y: number } | null>(null);
  const { data } = useQuery(queries.playlists());
  // On a narrow window the sidebar is a sheet: going somewhere closes it.
  const { setOpenMobile } = useSidebar();
  // biome-ignore lint/correctness/useExhaustiveDependencies: close on every navigation
  useEffect(() => setOpenMobile(false), [path, setOpenMobile]);
  const playlists = [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Sidebar collapsible="icon" className="bottom-(--bar-height) h-auto">
      {menu && (
        <Suspense>
          <PointMenu target={menu.target} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />
        </Suspense>
      )}
      {/* `contents` keeps the sidebar's flex layout; the nav makes it a landmark for screen readers. */}
      <nav aria-label="sidebar" className="contents">
        <SidebarHeader className="gap-1.5">
          <div className="flex h-7 items-center px-2 group-data-[collapsible=icon]:px-2.5 group-data-[collapsible=icon]:[&_span:last-child]:hidden">
            <BrandMark />
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className={LABEL}>library</SidebarGroupLabel>
            <SidebarMenu>
              {LIBRARY.map(([href, label, Icon]) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    size="sm"
                    className="font-mono text-muted-foreground"
                    isActive={href === "/" ? path === "/" : path.startsWith(href)}
                    tooltip={label}
                    render={<Link href={href} />}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel className={LABEL}>playlists</SidebarGroupLabel>
            <SidebarGroupAction title="new playlist" aria-label="new playlist" onClick={() => openPlaylistDialog({ kind: "new" })}>
              <PlusIcon />
            </SidebarGroupAction>
            <SidebarMenu>
              <SidebarMenuItem>
                {playlists.length === 0 ? (
                  <span className="flex h-7 items-center gap-2 px-2 text-faint text-xs">
                    <ListMusicIcon /> none yet · save your queue as one
                  </span>
                ) : (
                  <SidebarMenuSub
                    className="mx-0 border-0 px-0"
                    onDragOver={(event) => {
                      const id = (event.target as Element).closest("[data-playlist-id]")?.getAttribute("data-playlist-id");
                      const playlist = playlists.find((item) => item.id === id);
                      const drag = currentDrag(event);
                      // Yours and not a smart playlist (lib/playlists canEdit, inlined to keep it off the first screen).
                      const editable = playlist && !playlist.readonly && (!playlist.owner || playlist.owner === user);
                      if (!drag || !playlist || !editable || (drag.target.kind === "playlist" && drag.target.playlist.id === id)) {
                        setDropId(null);
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                      setDropId(playlist.id);
                    }}
                    onDragLeave={(event) => leftTarget(event) && setDropId(null)}
                    onDrop={(event) => {
                      const drag = currentDrag(event);
                      const playlist = playlists.find((item) => item.id === dropId);
                      setDropId(null);
                      if (!drag || !playlist) return;
                      event.preventDefault();
                      endDrag();
                      void Promise.all([dropSongs(drag.target), import("@/lib/playlists")])
                        .then(([songs, edits]) => edits.addToPlaylist(playlist, songs))
                        .catch(dropFailed);
                    }}
                    onContextMenu={(event) => {
                      const id = (event.target as Element).closest("[data-playlist-id]")?.getAttribute("data-playlist-id");
                      const playlist = playlists.find((item) => item.id === id);
                      if (!playlist) return;
                      event.preventDefault();
                      setMenu({ target: { kind: "playlist", playlist }, x: event.clientX, y: event.clientY });
                    }}
                  >
                    <SubTree node={tree(playlists)} path={path} dropId={dropId} />
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t">
          {elsewhere[0] && (
            <Suspense>
              <ElsewhereBadge playing={elsewhere[0]} />
            </Suspense>
          )}
        </SidebarFooter>
      </nav>
    </Sidebar>
  );
}
