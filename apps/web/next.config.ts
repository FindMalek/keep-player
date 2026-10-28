import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Hosted on Vercel (production and per-PR previews); the monorepo root is where its files come from.
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  transpilePackages: ["@lodesong/ui"],
  // Types are checked by the repo's `typecheck` task (TypeScript 7), not by next build.
  typescript: { ignoreBuildErrors: true },
  images: { formats: ["image/avif", "image/webp"] },
  // Any docs page as markdown: /docs.md, /docs/self-hosting.md.
  async rewrites() {
    return [
      { source: "/docs.md", destination: "/llms.mdx/docs" },
      { source: "/docs/:path*.md", destination: "/llms.mdx/docs/:path*" },
    ];
  },
};

export default createMDX()(config);
