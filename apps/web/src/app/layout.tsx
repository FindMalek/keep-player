import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/site";

const DESCRIPTION =
  "A self-hosted music player for Navidrome: made-for-you mixes, synced lyrics, one session across your devices and the song in your Mac's notch. Open source.";

// Share images come from each route's opengraph-image; Twitter reads the same ones.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "lodesong: a real music app for the music you own", template: "%s · lodesong" },
  description: DESCRIPTION,
  applicationName: "lodesong",
  keywords: ["navidrome", "subsonic", "music player", "self-hosted", "spotify alternative", "synced lyrics", "open source", "macos"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "lodesong", locale: "en", url: "/", description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ebebeb" },
    { media: "(prefers-color-scheme: dark)", color: "#101010" },
  ],
};

// The theme follows the system, set before paint so dark mode never flashes light.
const THEME = `(() => {
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => document.documentElement.classList.toggle("dark", dark.matches);
  apply();
  dark.addEventListener("change", apply);
})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant, set before paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body className="flex min-h-screen flex-col">
        {/* Docs search and layout; the theme stays ours (the script above follows the system). */}
        <RootProvider theme={{ enabled: false }}>{children}</RootProvider>
      </body>
    </html>
  );
}
