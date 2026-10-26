import { MarkdownCopyButton, ViewOptionsPopover } from "fumadocs-ui/layouts/docs/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { REPO } from "@/lib/site";
import { source } from "@/lib/source";

type Props = { params: Promise<{ slug?: string[] }> };

const DATE = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

/** `/docs` → `/docs.md`, `/docs/self-hosting` → `/docs/self-hosting.md` (next.config rewrites them to the markdown). */
const markdownUrl = (url: string) => `${url}.md`;

export default async function Page({ params }: Props) {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  const Body = page.data.body;
  const { updated } = page.data;
  return (
    <DocsPage toc={page.data.toc} full={page.data.full} tableOfContent={{ style: "clerk" }} breadcrumb={{ enabled: true }}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-wrap items-center gap-2 border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl(page.url)} />
        <ViewOptionsPopover markdownUrl={markdownUrl(page.url)} githubUrl={`${REPO}/blob/main/${page.data.source}`} />
        {updated && <span className="ml-auto font-mono text-muted-foreground text-xs">updated {DATE.format(new Date(updated))}</span>}
      </div>
      <DocsBody>
        <Body components={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  return {
    title: `${page.data.title} · docs`,
    description: page.data.description,
    alternates: { canonical: page.url, types: { "text/markdown": markdownUrl(page.url) } },
    openGraph: {
      type: "article",
      url: page.url,
      title: page.data.title,
      description: page.data.description,
      images: [{ url: page.url.replace(/^\/docs/, "/og/docs"), width: 1200, height: 630 }],
    },
  };
}
