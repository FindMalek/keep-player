import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "lodesong",
    short_name: "lodesong",
    description: "A real music app for the music you own: a player for Navidrome.",
    start_url: "/",
    display: "browser",
    background_color: "#101010",
    theme_color: "#101010",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/apple-icon", type: "image/png", sizes: "180x180" },
    ],
  };
}
