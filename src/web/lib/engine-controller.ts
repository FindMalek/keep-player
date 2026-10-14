import { useMemo } from "react";
import type { AudioPlayerController, AudioPlayerStatus } from "@/hooks/use-audio-player";
import { currentSong, player, positionFrames, usePlayer } from "./player";

/**
 * Our engine behind audiocn's `AudioPlayerController`, so the audiocn components render it without owning an <audio>.
 * Position and buffered are getters plus a frame source: the controller only changes identity on state the bar shows,
 * never per frame, so the player bar doesn't re-render while a song plays.
 */
export function useEngineController(): AudioPlayerController {
  const hasSong = usePlayer((state) => currentSong(state) !== undefined);
  const playing = usePlayer((state) => state.playing);
  const buffering = usePlayer((state) => state.buffering);
  const failed = usePlayer((state) => state.error !== null);
  const duration = usePlayer((state) => state.duration);
  const volume = usePlayer((state) => state.volume);
  const muted = usePlayer((state) => state.muted);
  const loop = usePlayer((state) => state.repeat === "one");

  return useMemo(() => {
    const status: AudioPlayerStatus = !hasSong ? "idle" : failed ? "error" : buffering ? "loading" : playing ? "playing" : "paused";
    return {
      element: player.element(),
      status,
      playing,
      get currentTime() {
        return player.getPosition();
      },
      duration,
      get buffered() {
        return player.getBuffered();
      },
      volume,
      muted,
      playbackRate: 1,
      loop,
      error: null,
      play: async () => player.toggle(true),
      pause: () => player.toggle(false),
      toggle: async () => player.toggle(),
      seek: player.seek,
      setVolume: player.setVolume,
      setMuted: (value: boolean) => value !== muted && player.toggleMute(),
      setPlaybackRate: () => undefined,
      setLoop: (value: boolean) => player.setRepeat(value ? "one" : "off"),
      time: positionFrames,
    };
  }, [hasSong, playing, buffering, failed, duration, volume, muted, loop]);
}
