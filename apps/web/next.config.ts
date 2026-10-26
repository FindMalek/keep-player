import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const config: NextConfig = {
  // A self-contained server for the Docker image (Dokploy), with only the files it needs.
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  transpilePackages: ["@keep/ui"],
  // Types are checked by the repo's `typecheck` task (TypeScript 7), not by next build.
  typescript: { ignoreBuildErrors: true },
  images: { formats: ["image/avif", "image/webp"] },
};

export default createMDX()(config);
