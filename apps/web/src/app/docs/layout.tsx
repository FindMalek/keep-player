import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { REPO } from "@/lib/site";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      nav={{
        title: (
          <span className="flex items-center gap-2.5 font-medium font-mono text-[13px]">
            <span aria-hidden className="size-2.5 bg-foreground" />
            keep music
          </span>
        ),
      }}
      // The site follows the system theme; fumadocs' switch would do nothing.
      themeSwitch={{ enabled: false }}
      links={[
        { text: "roadmap", url: "/roadmap" },
        { text: "github", url: REPO, external: true },
      ]}
    >
      {children}
    </DocsLayout>
  );
}
