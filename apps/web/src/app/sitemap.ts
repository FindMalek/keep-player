import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { source } from "@/lib/source";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/roadmap`, changeFrequency: "daily", priority: 0.6 },
    ...source
      .getPages()
      .map((page) => ({ url: `${SITE_URL}${page.url}`, changeFrequency: "weekly" as const, priority: page.url === "/docs" ? 0.9 : 0.7 })),
  ];
}
