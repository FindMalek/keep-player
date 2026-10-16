import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BrandMark } from "./brand";
import { AccountMenu } from "./top-bar";

/** Below the `md` breakpoint the sidebar is a sheet, and this strip is the way to open it (and to search). */
export function MobileBar({ onSearch, onShortcuts }: { onSearch: () => void; onShortcuts: () => void }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b px-2 md:hidden">
      <SidebarTrigger aria-label="open menu" />
      <BrandMark />
      <Button variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground" aria-label="search" onClick={onSearch}>
        <SearchIcon />
      </Button>
      <AccountMenu onShortcuts={onShortcuts} />
    </div>
  );
}
