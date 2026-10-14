import {
  ChevronRightIcon,
  Disc3Icon,
  FolderIcon,
  HouseIcon,
  ListMusicIcon,
  LogOutIcon,
  MonitorIcon,
  MonitorSmartphoneIcon,
  MoonIcon,
  MusicIcon,
  SearchIcon,
  SunIcon,
  TagIcon,
  UsersIcon,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { api, logout, useUser } from "@/lib/subsonic";
import { setTheme, type Theme, useTheme } from "@/lib/theme";
import type { Playlist } from "@/lib/types";
import { useQuery } from "@/lib/use-query";
import { BrandMark } from "./brand";
import { Link } from "./link";

// Rarely opened; keeps the dialog code out of the first load.
const SessionsDialog = lazy(() => import("./sessions-dialog").then((module) => ({ default: module.SessionsDialog })));

const LIBRARY = [
  ["/", "home", HouseIcon],
  ["/albums", "albums", Disc3Icon],
  ["/artists", "artists", UsersIcon],
  ["/songs", "songs", MusicIcon],
  ["/genres", "genres", TagIcon],
  ["/folders", "folders", FolderIcon],
] as const;

const THEMES = [
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
          <CollapsibleTrigger
            render={<SidebarMenuSubButton className="font-mono text-muted-foreground [&[data-panel-open]>svg]:rotate-90" />}
          >
            <ChevronRightIcon className="transition-transform" />
            <span>{folder.name}</span>
          </CollapsibleTrigger>
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

function UserMenu({ onSessions }: { onSessions: () => void }) {
  const theme = useTheme();
  const user = useUser() ?? "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<SidebarMenuButton size="sm" className="font-mono" tooltip={user} />}>
        <span aria-hidden className="grid size-4 place-items-center bg-foreground text-[10px] text-background uppercase">
          {user.slice(0, 1)}
        </span>
        <span>{user}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel className={LABEL}>theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
            {THEMES.map(([value, Icon]) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon />
                {value}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSessions}>
          <MonitorSmartphoneIcon />
          sessions
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void logout()}>
          <LogOutIcon />
          log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar({ path, onSearch }: { path: string; onSearch: () => void }) {
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const { data } = useQuery("playlists", () => api<{ playlists: { playlist?: Playlist[] } }>("getPlaylists"));
  const playlists = (data?.playlists.playlist ?? []).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Sidebar collapsible="icon" className="bottom-(--bar-height) h-auto">
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
                  <ListMusicIcon /> none yet
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
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu onSessions={() => setSessionsOpen(true)} />
            {sessionsOpen && (
              <Suspense>
                <SessionsDialog open={sessionsOpen} onOpenChange={setSessionsOpen} />
              </Suspense>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
