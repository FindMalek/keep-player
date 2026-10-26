import { docsLlms } from "@/lib/llms";

export const revalidate = false;

export function GET() {
  return new Response(docsLlms.index(), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
