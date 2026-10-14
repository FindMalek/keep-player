import { HardDriveDownloadIcon, KeyboardIcon, LogOutIcon, MonitorIcon, MonitorSmartphoneIcon, MoonIcon, SunIcon } from "lucide-react";
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
import { SidebarMenuButton } from "@/components/ui/sidebar";
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
}: {
  defaultOpen: boolean;
  onSessions: () => void;
  onStorage: () => void;
  onShortcuts: () => void;
}) {
  const theme = useTheme();
  const user = useUser() ?? "";
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
        <DropdownMenuItem onClick={onShortcuts}>
          <KeyboardIcon />
          keyboard shortcuts
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onStorage}>
          <HardDriveDownloadIcon />
          offline storage
        </DropdownMenuItem>
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
