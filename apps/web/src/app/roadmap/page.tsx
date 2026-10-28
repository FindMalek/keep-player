import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { type Item, roadmap } from "@/lib/roadmap";
import { REPO } from "@/lib/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "roadmap",
  description: "What shipped, what's being built, what's next and what's parked, straight from GitHub.",
  alternates: { canonical: "/roadmap" },
  // Its own og:url, or shares inherit the layout's "/" and land on the home page.
  openGraph: {
    type: "website",
    siteName: "lodesong",
    url: "/roadmap",
    title: "roadmap · lodesong",
    description: "What shipped, what's being built, what's next and what's parked, straight from GitHub.",
  },
};

function Column({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 bg-background p-6">
      <div>
        <h2 className="font-medium font-mono text-sm">{title}</h2>
        <p className="mt-1 text-muted-foreground text-xs">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Items({ items, empty }: { items: Item[]; empty: string }) {
  if (!items.length) return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item.number}>
          <a href={item.url} className="group flex gap-2 text-sm">
            <span className="shrink-0 font-mono text-muted-foreground text-xs leading-5">#{item.number}</span>
            <span className="group-hover:underline group-hover:underline-offset-2">{item.title}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

const DATE = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

export default async function RoadmapPage() {
  const { shipped, now, next, later } = await roadmap();
  const total = now ? now.done + now.open.length : 0;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="font-medium text-4xl tracking-tight sm:text-5xl">roadmap</h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          read live from{" "}
          <a href={`${REPO}/issues`} className="underline underline-offset-2">
            github
          </a>
          : what's being built, what comes after, what's parked, and what already shipped. one issue is one pull request.
        </p>

        <div className="mt-12 grid gap-px border bg-border md:grid-cols-3">
          <Column title={now ? `now · ${now.milestone}` : "now"} hint="the milestone being built">
            {now && total > 0 && (
              <div className="flex items-center gap-3 font-mono text-muted-foreground text-xs">
                <span className="h-1.5 flex-1 bg-muted">
                  <span className="block h-full bg-foreground" style={{ width: `${(now.done / total) * 100}%` }} />
                </span>
                {now.done} of {total} done
              </div>
            )}
            <Items items={now?.open ?? []} empty="everything planned for this milestone is done" />
          </Column>
          <Column title="next" hint="the big areas still open">
            <Items items={next} empty="nothing queued" />
          </Column>
          <Column title="later" hint="ideas parked until the current work settles">
            <Items items={later} empty="nothing parked" />
          </Column>
        </div>

        <h2 className="mt-20 font-medium text-2xl tracking-tight">shipped</h2>
        <ol className="mt-8 flex flex-col">
          {shipped.map((release) => (
            <li key={release.tag} className="grid gap-2 border-t py-6 sm:grid-cols-[180px_1fr]">
              <div>
                <a href={release.url} className="font-medium font-mono text-sm hover:underline">
                  {release.tag}
                </a>
                <p className="mt-1 font-mono text-muted-foreground text-xs">{DATE.format(new Date(release.date))}</p>
              </div>
              <ul className="flex flex-col gap-1.5 text-muted-foreground text-sm">
                {release.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </main>
      <SiteFooter />
    </>
  );
}
