import { OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";

export const alt = "lodesong: a real music app for the music you own";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "a player for navidrome · open source",
    title: "a real music app for the music you own.",
    subtitle: "mixes from what you play, synced lyrics, one session across your devices, the song in your mac's notch.",
  });
}
