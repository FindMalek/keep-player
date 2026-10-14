import type { Panel } from "./components/player-bar";
import type { notify } from "./lib/notify";
import type { player } from "./lib/player";
import type { go } from "./lib/router";
import type { Shortcut } from "./lib/shortcuts";

export interface AppActions {
  player: typeof player;
  go: typeof go;
  notify: typeof notify;
  togglePanel: (panel: Exclude<Panel, null>) => void;
  closeTopLayer: () => void;
  openSearch: () => void;
  toggleSearch: () => void;
}

/** The default map. Everything it calls is passed in, so a unit test can check it for conflicts without a browser. */
export function appShortcuts(actions: AppActions): Shortcut[] {
  const { player, go, notify } = actions;
  const seekBy = (seconds: number) => () => player.seek(player.getPosition() + seconds);
  const volumeBy = (step: number) => () => player.setVolume(player.getState().volume + step);
  const global = (id: string, keys: string[], label: string, group: Shortcut["group"], run: Shortcut["run"]): Shortcut => ({
    id,
    keys,
    label,
    group,
    scope: "global",
    run,
  });
  return [
    global("play-pause", ["space"], "play / pause", "playback", () => player.toggle()),
    global("seek-forward", ["arrowright"], "forward 5 s", "playback", seekBy(5)),
    global("seek-back", ["arrowleft"], "back 5 s", "playback", seekBy(-5)),
    global("seek-forward-far", ["shift+arrowright"], "forward 30 s", "playback", seekBy(30)),
    global("seek-back-far", ["shift+arrowleft"], "back 30 s", "playback", seekBy(-30)),
    global("nudge-forward", ["."], "forward 1 s", "playback", seekBy(1)),
    global("nudge-back", [","], "back 1 s", "playback", seekBy(-1)),
    global("next", ["n", "mod+arrowright"], "next song", "playback", () => player.next()),
    global("previous", ["p", "mod+arrowleft"], "previous song", "playback", () => player.previous()),
    global("volume-up", ["arrowup"], "volume up", "playback", volumeBy(0.05)),
    global("volume-down", ["arrowdown"], "volume down", "playback", volumeBy(-0.05)),
    ...Array.from({ length: 10 }, (_, digit) =>
      global(`jump-${digit}`, [String(digit)], `jump to ${digit * 10}%`, "playback", () =>
        player.seek(player.getState().duration * (digit / 10)),
      ),
    ),
    global("mute", ["m"], "mute", "playback", () => player.toggleMute()),
    global("shuffle", ["s"], "shuffle", "playback", () => player.toggleShuffle()),
    global("repeat", ["r"], "repeat: off / all / one", "playback", () => player.cycleRepeat()),
    global("stop-after", ["shift+s"], "stop after this song", "playback", () => {
      player.toggleStopAfterCurrent();
      notify({ message: player.getState().sleep ? "will stop after this song" : "will keep playing" });
    }),
    global("queue", ["q"], "queue", "panels", () => actions.togglePanel("queue")),
    global("lyrics", ["y"], "lyrics", "panels", () => actions.togglePanel("lyrics")),
    global("close", ["escape"], "close the top panel", "panels", () => actions.closeTopLayer()),
    global("search", ["mod+k", "/"], "search", "navigation", (event) =>
      event.code === "Slash" ? actions.openSearch() : actions.toggleSearch(),
    ),
    global("go-home", ["g h"], "go to home", "navigation", () => go("/")),
    global("go-albums", ["g a"], "go to albums", "navigation", () => go("/albums")),
    global("go-artists", ["g r"], "go to artists", "navigation", () => go("/artists")),
    global("go-songs", ["g s"], "go to songs", "navigation", () => go("/songs")),
    global("go-genres", ["g g"], "go to genres", "navigation", () => go("/genres")),
    global("go-folders", ["g f"], "go to folders", "navigation", () => go("/folders")),
    global("go-queue", ["g q"], "open the queue", "navigation", () => actions.togglePanel("queue")),
    global("back", ["mod+[", "backspace"], "back", "navigation", () => window.history.back()),
    global("forward", ["mod+]"], "forward", "navigation", () => window.history.forward()),
    { ...global("sidebar", ["mod+b"], "show / hide the sidebar", "navigation", () => undefined), passive: true },
  ];
}
