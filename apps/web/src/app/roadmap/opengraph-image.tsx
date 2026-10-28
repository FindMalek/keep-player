import { OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";

export const alt = "lodesong's roadmap";
export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const revalidate = 3600;

export default function Image() {
  return ogImage({ eyebrow: "lodesong · roadmap", title: "what shipped, what's next.", subtitle: "read live from github." });
}
