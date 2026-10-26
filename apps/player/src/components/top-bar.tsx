import { Button } from "@keep/ui/components/button";
import { Kbd } from "@keep/ui/components/kbd";
import { ArrowLeftIcon, ArrowRightIcon, SearchIcon } from "lucide-react";
import { lazy, Suspense, useState, useSyncExternalStore } from "react";
import { useUser } from "@/lib/subsonic";

// The menu (Base UI menu + positioning) loads after first paint; the same button stands in until then.
const UserMenu = lazy(() => import("./user-menu").then((module) => ({ default: module.UserMenu })));

/** The account menu, in the top bar (and the phone bar). A click before the menu has loaded opens it on arrival. */
export function AccountMenu({ onShortcuts }: { onShortcuts: () => void }) {
  const user = useUser() ?? "";
  const [wanted, setWanted] = useState(false);
  return (
    <Suspense
      fallback={
        <Button variant="ghost" size="sm" className="font-mono" aria-label={user} title={user} onClick={() => setWanted(true)}>
          <span aria-hidden className="grid size-4 place-items-center bg-foreground text-[10px] text-background uppercase">
            {user.slice(0, 1)}
          </span>
          <span className="hidden max-w-32 truncate md:inline">{user}</span>
        </Button>
      }
    >
      <UserMenu defaultOpen={wanted} onShortcuts={onShortcuts} />
    </Suspense>
  );
}

interface NavigationApi {
  canGoBack: boolean;
  canGoForward: boolean;
}

// Back/forward both end in a popstate, and a link or search result is a push: any of them can change what's possible.
function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener("keep:navigate", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("keep:navigate", onChange);
  };
}

/** Chromium and Safari know their own history; elsewhere back is assumed possible past the first entry. */
function history(): { back: boolean; forward: boolean } {
  const navigation = (window as unknown as { navigation?: NavigationApi }).navigation;
  if (navigation) return { back: navigation.canGoBack, forward: navigation.canGoForward };
  return { back: window.history.length > 1, forward: true };
}

const snapshot = () => {
  const { back, forward } = history();
  return `${back ? 1 : 0}${forward ? 1 : 0}`;
};

/** Above the page, from `md` up: back and forward, search, and the account. Phones have the mobile bar instead. */
export function TopBar({ onSearch, onShortcuts }: { onSearch: () => void; onShortcuts: () => void }) {
  const state = useSyncExternalStore(subscribe, snapshot);
  return (
    <div role="toolbar" aria-label="app bar" className="hidden h-11 shrink-0 items-center gap-1 border-b px-2 md:flex">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="back"
        title="back"
        disabled={state[0] === "0"}
        onClick={() => window.history.back()}
      >
        <ArrowLeftIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="forward"
        title="forward"
        disabled={state[1] === "0"}
        onClick={() => window.history.forward()}
      >
        <ArrowRightIcon />
      </Button>
      <div className="flex flex-1 justify-center px-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full max-w-md justify-start font-normal text-muted-foreground"
          aria-label="search"
          title="search ⌘K"
          onClick={onSearch}
        >
          <SearchIcon />
          <span className="flex-1 text-left">search</span>
          <Kbd>⌘K</Kbd>
        </Button>
      </div>
      <AccountMenu onShortcuts={onShortcuts} />
    </div>
  );
}
