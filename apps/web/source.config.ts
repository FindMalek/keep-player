import { defineConfig, defineDocs } from "fumadocs-mdx/config";

// `content/docs` is generated from the repo's docs/ by scripts/sync-docs.ts.
export const docs = defineDocs({ dir: "content/docs" });

export default defineConfig();
