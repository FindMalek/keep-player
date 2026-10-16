import { useQuery } from "@tanstack/react-query";
import { ArrowUpCircleIcon, KeyboardIcon, LogOutIcon, MonitorIcon, MoonIcon, SettingsIcon, SunIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
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
import { apiQueries } from "@/lib/api-queries";
import { go } from "@/lib/router";
import { logout, useUser } from "@/lib/subsonic";
import { setTheme, type Theme, useTheme } from "@/lib/theme";

const THEMES = [
  ["system", MonitorIcon],
  ["dark", MoonIcon],
  ["light", SunIcon],
] as const;

const LABEL = "font-mono text-[10.5px] text-faint";

/** The few things you change often. Everything else is in settings. */
export function UserMenu({ defaultOpen, onShortcuts }: { defaultOpen: boolean; onShortcuts: () => void }) {
  const theme = useTheme();
  const user = useUser() ?? "";
  const version = useQuery(apiQueries.version()).data;
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="font-mono" aria-label={user} title={user} />}>
        <span aria-hidden className="grid size-4 place-items-center bg-foreground text-[10px] text-background uppercase">
          {user.slice(0, 1)}
        </span>
        <span className="hidden max-w-32 truncate md:inline">{user}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="min-w-44">
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
        <DropdownMenuItem onClick={onShortcuts}>
          <KeyboardIcon />
          keyboard shortcuts
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("/settings")}>
          <SettingsIcon />
          settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("/listen")}>
          <UsersIcon />
          listen together
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
