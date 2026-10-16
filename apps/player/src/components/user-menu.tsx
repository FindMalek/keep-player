import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpCircleIcon,
  DatabaseIcon,
  HardDriveDownloadIcon,
  KeyboardIcon,
  LogOutIcon,
  MicVocalIcon,
  MonitorIcon,
  MonitorSmartphoneIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  UsersIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { apiQueries } from "@/lib/api-queries";
import { MINI_PLAYER_SUPPORTED } from "@/lib/mini-player";
import { go } from "@/lib/router";
import { setSetting, useSetting } from "@/lib/settings";
import { logout, useUser } from "@/lib/subsonic";
import { setTheme, type Theme, useTheme } from "@/lib/theme";

const THEMES = [
  ["system", MonitorIcon],
  ["dark", MoonIcon],
  ["light", SunIcon],
] as const;

const LABEL = "font-mono text-[10.5px] text-faint";

export function UserMenu({
  defaultOpen,
  onSessions,
  onStorage,
  onShortcuts,
  onIndex,
}: {
  defaultOpen: boolean;
  onIndex: () => void;
  onSessions: () => void;
  onStorage: () => void;
  onShortcuts: () => void;
}) {
  const theme = useTheme();
  const ratings = useSetting("ratings");
  const reduceMotion = useSetting("reduceMotion");
  const queueSync = useSetting("queueSync");
  const followOthers = useSetting("followOtherDevices");
  const miniWhenHidden = useSetting("miniPlayerWhenHidden");
  const user = useUser() ?? "";
  const admin = useQuery(apiQueries.session()).data?.admin;
  const version = useQuery(apiQueries.version()).data;
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
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
        <DropdownMenuCheckboxItem checked={ratings} onCheckedChange={(checked) => setSetting("ratings", checked === true)}>
          show ratings
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={reduceMotion} onCheckedChange={(checked) => setSetting("reduceMotion", checked === true)}>
          reduce motion
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={queueSync} onCheckedChange={(checked) => setSetting("queueSync", checked === true)}>
          sync with your other devices (queue, now playing)
        </DropdownMenuCheckboxItem>
        {queueSync && (
          <DropdownMenuCheckboxItem
            checked={followOthers}
            onCheckedChange={(checked) => setSetting("followOtherDevices", checked === true)}
          >
            pick up their queue without asking
          </DropdownMenuCheckboxItem>
        )}
        {MINI_PLAYER_SUPPORTED && (
          <DropdownMenuCheckboxItem
            checked={miniWhenHidden}
            onCheckedChange={(checked) => setSetting("miniPlayerWhenHidden", checked === true)}
          >
            mini player when you leave the tab
          </DropdownMenuCheckboxItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onShortcuts}>
          <KeyboardIcon />
          keyboard shortcuts
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onStorage}>
          <HardDriveDownloadIcon />
          offline storage
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("/settings")}>
          <SettingsIcon />
          settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("/listen")}>
          <UsersIcon />
          listen together
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("/lyrics")}>
          <MicVocalIcon />
          lyrics coverage
        </DropdownMenuItem>
        {admin && (
          <DropdownMenuItem onClick={onIndex}>
            <DatabaseIcon />
            library index
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onSessions}>
          <MonitorSmartphoneIcon />
          sessions
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void logout()}>
          <LogOutIcon />
          log out
        </DropdownMenuItem>
        {version && (
          <>
            <DropdownMenuSeparator />
            {version.updateAvailable ? (
              <DropdownMenuItem
                render={
                  <a href={`https://github.com/FindMalek/keep-player/releases/tag/v${version.latest}`} target="_blank" rel="noreferrer" />
                }
              >
                <ArrowUpCircleIcon />
                update available · v{version.latest}
              </DropdownMenuItem>
            ) : null}
            {/* Base UI labels must sit in a group. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className={LABEL}>keep music v{version.version}</DropdownMenuLabel>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
