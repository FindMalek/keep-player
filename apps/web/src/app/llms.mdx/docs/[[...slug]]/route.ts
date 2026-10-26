import { notFound } from "next/navigation";
import { docsLlms } from "@/lib/llms";
import { source } from "@/lib/source";

export const revalidate = false;

/** One docs page as markdown; `/docs/<page>.md` is rewritten here (next.config). */
export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  return new Response(await docsLlms.page(page), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}

export function generateStaticParams() {
  return source.generateParams();
}
