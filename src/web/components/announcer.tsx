import { currentSong, usePlayer } from "@/lib/player";

/** Tells screen readers what's playing whenever the song changes (the player bar itself stays quiet). */
export function NowPlayingAnnouncer() {
  const song = usePlayer(currentSong);
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {song ? `now playing ${song.title}${song.artist ? ` by ${song.artist}` : ""}` : ""}
    </div>
  );
}
