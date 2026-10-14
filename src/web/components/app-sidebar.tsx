import { useQuery } from "@tanstack/react-query";
import {
  ChevronRightIcon,
  Disc3Icon,
  FolderIcon,
  HeartIcon,
  HistoryIcon,
  HouseIcon,
  ListMusicIcon,
  MonitorIcon,
  MoonIcon,
  MusicIcon,
  SearchIcon,
  SunIcon,
  TagIcon,
  UsersIcon,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Kbd } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useElsewhere } from "@/lib/elsewhere";
import { queries } from "@/lib/queries";
import { useUser } from "@/lib/subsonic";
import type { Playlist } from "@/lib/types";
import { BrandMark } from "./brand";
import { Link } from "./link";

// Rarely opened; keeps the dialog code out of the first load.
const StorageDialog = lazy(() => import("./storage-dialog").then((module) => ({ default: module.StorageDialog })));
const ElsewhereBadge = lazy(() => import("./elsewhere-badge").then((module) => ({ default: module.ElsewhereBadge })));
const IndexDialog = lazy(() => import("./index-dialog").then((module) => ({ default: module.IndexDialog })));
const SessionsDialog = lazy(() => import("./sessions-dialog").then((module) => ({ default: module.SessionsDialog })));

const LIBRARY = [
  ["/", "home", HouseIcon],
  ["/albums", "albums", Disc3Icon],
  ["/artists", "artists", UsersIcon],
  ["/songs", "songs", MusicIcon],
  ["/liked", "liked songs", HeartIcon],
  ["/history", "history", HistoryIcon],
  ["/genres", "genres", TagIcon],
  ["/folders", "folders", FolderIcon],
] as const;

const _THEMES = [
  ["system", MonitorIcon],
  ["dark", MoonIcon],
  ["light", SunIcon],
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

function SubTree({ node, path }: { node: FolderNode; path: string }) {
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
          <CollapsibleContent>
            <SidebarMenuSub className="mr-0 pr-0">
              <SubTree node={folder} path={path} />
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      ))}
      {node.playlists.map((playlist) => {
        const href = `/playlist/${playlist.id}`;
        return (
          <SidebarMenuSubItem key={playlist.id}>
            <SidebarMenuSubButton isActive={path === href} className="font-mono text-muted-foreground" render={<Link href={href} />}>
              <span>{playlist.name.split(" / ").at(-1)}</span>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        );
      })}
    </>
  );
}

// The menu (Base UI menu + positioning) loads after first paint; the same button stands in until then.
const UserMenu = lazy(() => import("./user-menu").then((module) => ({ default: module.UserMenu })));

/** Stands in for the menu while it loads; a click here opens the menu as soon as it arrives. */
function UserButton({ user, onClick }: { user: string; onClick: () => void }) {
  return (
    <SidebarMenuButton size="sm" className="font-mono" onClick={onClick}>
      <span aria-hidden className="grid size-4 place-items-center bg-foreground text-[10px] text-background uppercase">
        {user.slice(0, 1)}
      </span>
      <span>{user}</span>
    </SidebarMenuButton>
  );
}

export function AppSidebar({ path, onSearch, onShortcuts }: { path: string; onSearch: () => void; onShortcuts: () => void }) {
  const user = useUser() ?? "";
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const elsewhere = useElsewhere();
  const [menuWanted, setMenuWanted] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const { data } = useQuery(queries.playlists());
  const playlists = [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Sidebar collapsible="icon" className="bottom-(--bar-height) h-auto">
      {/* `contents` keeps the sidebar's flex layout; the nav makes it a landmark for screen readers. */}
      <nav aria-label="sidebar" className="contents">
        <SidebarHeader className="gap-1.5">
          <div className="flex h-7 items-center px-2 group-data-[collapsible=icon]:px-2.5 group-data-[collapsible=icon]:[&_span:last-child]:hidden">
            <BrandMark />
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton variant="outline" size="sm" className="text-muted-foreground" onClick={onSearch} tooltip="search ⌘K">
                <SearchIcon />
                <span className="flex-1">search</span>
                <Kbd>⌘K</Kbd>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
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
            <SidebarMenu>
              <SidebarMenuItem>
                {playlists.length === 0 ? (
                  <span className="flex h-7 items-center gap-2 px-2 text-faint text-xs">
                    <ListMusicIcon /> none yet · save your queue as one
                  </span>
                ) : (
                  <SidebarMenuSub className="mx-0 border-0 px-0">
                    <SubTree node={tree(playlists)} path={path} />
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
          <SidebarMenu>
            <SidebarMenuItem>
              <Suspense fallback={<UserButton user={user} onClick={() => setMenuWanted(true)} />}>
                <UserMenu
                  defaultOpen={menuWanted}
                  onSessions={() => setSessionsOpen(true)}
                  onIndex={() => setIndexOpen(true)}
                  onStorage={() => setStorageOpen(true)}
                  onShortcuts={onShortcuts}
                />
              </Suspense>
              {storageOpen && (
                <Suspense>
                  <StorageDialog open={storageOpen} onOpenChange={setStorageOpen} />
                </Suspense>
              )}
              {indexOpen && (
                <Suspense>
                  <IndexDialog open={indexOpen} onOpenChange={setIndexOpen} />
                </Suspense>
              )}
              {sessionsOpen && (
                <Suspense>
                  <SessionsDialog open={sessionsOpen} onOpenChange={setSessionsOpen} />
                </Suspense>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </nav>
    </Sidebar>
  );
}
