import { Button } from "@keep/ui/components/button";
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
} from "@keep/ui/components/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpCircleIcon,
  KeyboardIcon,
  LogOutIcon,
  MessageSquareIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  UsersIcon,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { apiQueries } from "@/lib/api-queries";
import { go } from "@/lib/router";
import { logout, useUser } from "@/lib/subsonic";
import { setTheme, type Theme, useTheme } from "@/lib/theme";

const THEMES = [
  ["system", MonitorIcon],
  ["dark", MoonIcon],
  ["light", SunIcon],
] as const;

const LABEL = "font-mono text-label text-faint";

const FeedbackDialog = lazy(() => import("./feedback-dialog").then((module) => ({ default: module.FeedbackDialog })));

/** The few things you change often. Everything else is in settings. */
export function UserMenu({ defaultOpen, onShortcuts }: { defaultOpen: boolean; onShortcuts: () => void }) {
  const theme = useTheme();
  const user = useUser() ?? "";
  const version = useQuery(apiQueries.version()).data;
  const canFeedback = useQuery(apiQueries.session()).data?.feedback === true;
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  return (
    <>
      {feedbackOpen && (
        <Suspense fallback={null}>
          <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
        </Suspense>
      )}
      <DropdownMenu defaultOpen={defaultOpen}>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="font-mono" aria-label={user} title={user} />}>
          <span aria-hidden className="grid size-4 place-items-center bg-foreground text-label text-background uppercase">
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
          {canFeedback && (
            <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
              <MessageSquareIcon />
              send feedback
            </DropdownMenuItem>
          )}
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
    </>
  );
}
