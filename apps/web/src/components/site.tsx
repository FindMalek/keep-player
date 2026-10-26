import { buttonVariants } from "@keep/ui/components/button";
import { cn } from "@keep/ui/lib/utils";
import Link from "next/link";
import { DOCS, REPO, SELF_HOSTING } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-medium font-mono text-[13px]">
          <span aria-hidden className="size-2.5 bg-foreground" />
          keep music
        </Link>
        <div className="ml-auto hidden items-center gap-6 text-muted-foreground text-sm sm:flex">
          <Link href="/#features" className="hover:text-foreground">
            features
          </Link>
          <Link href="/#compare" className="hover:text-foreground">
            compare
          </Link>
          <Link href="/roadmap" className="hover:text-foreground">
            roadmap
          </Link>
          <a href={DOCS} className="hover:text-foreground">
            docs
          </a>
        </div>
        <a href={SELF_HOSTING} className={cn(buttonVariants({ size: "sm" }), "ml-auto sm:ml-0")}>
          self-host it
        </a>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 font-mono text-muted-foreground text-xs sm:px-6">
        <span>keep music · mit</span>
        <a href={REPO} className="hover:text-foreground">
          source
        </a>
        <a href={DOCS} className="hover:text-foreground">
          docs
        </a>
        <Link href="/roadmap" className="hover:text-foreground">
          roadmap
        </Link>
        <a href={`${REPO}/releases`} className="hover:text-foreground">
          releases
        </a>
        <a href="https://github.com/FindMalek" className="ml-auto hover:text-foreground">
          by findmalek
        </a>
      </div>
    </footer>
  );
}
