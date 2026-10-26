import { defineConfig, defineDocs, frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

// `content/docs` is generated from the repo's docs/ by scripts/sync-docs.ts, which also stamps where each page comes
// from and when that file last changed.
export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: frontmatterSchema.extend({ source: z.string(), updated: z.string().optional() }),
    // The page as markdown, for /llms-full.txt, /docs/<page>.md and "copy as markdown".
    postprocess: { includeProcessedMarkdown: true },
  },
});

export default defineConfig();
