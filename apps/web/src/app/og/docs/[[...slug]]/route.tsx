import { notFound } from "next/navigation";
import { ogImage } from "@/lib/og";
import { source } from "@/lib/source";

/** A docs page's share image (`opengraph-image` can't sit under an optional catch-all). */
export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  const description = page.data.description;
  return ogImage({
    eyebrow: "lodesong · docs",
    title: page.data.title,
    subtitle: description && description.length > 150 ? `${description.slice(0, 147).replace(/\s\S*$/, "")}…` : description,
  });
}

export function generateStaticParams() {
  return source.generateParams();
}
