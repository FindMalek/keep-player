import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { REPO } from "@/lib/site";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      nav={{
        url: "/",
        title: (
          <span className="flex items-center gap-2.5 font-medium font-mono text-body">
            <span aria-hidden className="size-2.5 bg-foreground" />
            lodesong
          </span>
        ),
      }}
      // The site follows the system theme; fumadocs' switch would do nothing.
      themeSwitch={{ enabled: false }}
      links={[
        { text: "roadmap", url: "/roadmap" },
        // The docs as markdown for language models (and the coding agent setting this up for you).
        { text: "llms.txt", url: "/llms.txt" },
        { text: "github", url: REPO, external: true },
      ]}
    >
      {children}
    </DocsLayout>
  );
}
