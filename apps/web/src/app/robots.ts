import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Vercel's preview deployments stay out of search; only production is indexed.
  return process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"
    ? { rules: { userAgent: "*", disallow: "/" } }
    : { rules: { userAgent: "*", allow: "/", disallow: "/api/" }, sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL };
}
