import { docsLlms } from "@/lib/llms";

export const revalidate = false;

export async function GET() {
  return new Response(await docsLlms.full(), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
