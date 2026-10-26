import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "keep music: a real music app for the music you own",
  description:
    "A web player for Navidrome: made-for-you mixes, synced lyrics, one session across your devices and a notch island on the Mac. Self-hosted, open source.",
  openGraph: { images: ["/shots/album-lyrics.png"] },
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
