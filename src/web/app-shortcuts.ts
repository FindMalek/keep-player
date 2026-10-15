import type { Panel } from "./components/player-bar";
import type { ListCommand, runListCommand } from "./lib/list-nav";
import type { notify } from "./lib/notify";
import type { player } from "./lib/player";
import type { go } from "./lib/router";
import type { Shortcut } from "./lib/shortcuts";

export interface AppActions {
  player: typeof player;
  go: typeof go;
  runListCommand: typeof runListCommand;
  notify: typeof notify;
  togglePanel: (panel: Exclude<Panel, null>) => void;
  closeTopLayer: () => void;
  openSearch: () => void;
  toggleSearch: () => void;
  openCheatSheet: () => void;
  toggleFullScreen: () => void;
  /** ⌘F: false when there's no list to filter, so the browser's own find opens. */
  findInList: () => boolean;
  likeCurrent: () => void;
  openMiniPlayer: () => void;
  newPlaylist: () => void;
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
    global("like", ["f"], "like the current song", "playback", () => actions.likeCurrent()),
    global("queue", ["q"], "queue", "panels", () => actions.togglePanel("queue")),
    global("lyrics", ["y"], "lyrics", "panels", () => actions.togglePanel("lyrics")),
    global("info", ["i"], "song info", "panels", () => actions.togglePanel("info")),
    global("mini-player", ["shift+m"], "mini player (always on top)", "panels", () => actions.openMiniPlayer()),
    global("full-screen", ["shift+f"], "full-screen now playing", "panels", () => actions.toggleFullScreen()),
    global("close", ["escape"], "close the top panel", "panels", () => actions.closeTopLayer()),
    global("search", ["mod+k", "/"], "search", "navigation", (event) =>
      event.code === "Slash" ? actions.openSearch() : actions.toggleSearch(),
    ),
    global("find-in-list", ["mod+f"], "filter this list", "lists", () => actions.findInList()),
    // ⌘N is the browser's new window: pages never receive it.
    global("new-playlist", ["shift+n"], "new playlist", "navigation", () => actions.newPlaylist()),
    global("cheat-sheet", ["?"], "keyboard shortcuts", "navigation", () => actions.openCheatSheet()),
    global("go-home", ["g h"], "go to home", "navigation", () => go("/")),
    global("go-albums", ["g a"], "go to albums", "navigation", () => go("/albums")),
    global("go-artists", ["g r"], "go to artists", "navigation", () => go("/artists")),
    global("go-songs", ["g s"], "go to songs", "navigation", () => go("/songs")),
    global("go-genres", ["g g"], "go to genres", "navigation", () => go("/genres")),
    global("go-history", ["g p"], "go to history", "navigation", () => go("/history")),
    global("go-stats", ["g t"], "go to stats", "navigation", () => go("/stats")),
    global("go-liked", ["g l"], "go to liked songs", "navigation", () => go("/liked")),
    global("go-folders", ["g f"], "go to folders", "navigation", () => go("/folders")),
    global("go-queue", ["g q"], "open the queue", "navigation", () => actions.togglePanel("queue")),
    global("back", ["mod+[", "backspace"], "back", "navigation", () => window.history.back()),
    global("forward", ["mod+]"], "forward", "navigation", () => window.history.forward()),
    ...listShortcuts(actions.runListCommand),
    { ...global("sidebar", ["mod+b"], "show / hide the sidebar", "navigation", () => undefined), passive: true },
  ];
}

/** In a focused list or grid; each falls through to the global shortcut on the same key when the list can't use it. */
function listShortcuts(run: typeof runListCommand): Shortcut[] {
  const list = (id: ListCommand, keys: string[], label: string): Shortcut => ({
    id: `list-${id}`,
    keys,
    label,
    group: "lists",
    scope: "list",
    run: () => run(id),
  });
  return [
    list("down", ["j", "arrowdown"], "next row"),
    list("up", ["k", "arrowup"], "previous row"),
    list("left", ["h", "arrowleft"], "left (grids)"),
    list("right", ["l", "arrowright"], "right (grids)"),
    list("first", ["home"], "first row"),
    list("last", ["end"], "last row"),
    list("extend-down", ["shift+j", "shift+arrowdown"], "extend selection down"),
    list("extend-up", ["shift+k", "shift+arrowup"], "extend selection up"),
    list("toggle", ["x"], "select / unselect"),
    list("select-all", ["mod+a"], "select all"),
    list("clear", ["escape"], "clear selection"),
    list("play", ["enter"], "play from here"),
    list("play-next", ["shift+enter"], "play next"),
    list("queue", ["a"], "add to queue"),
    list("open", ["o"], "open album / artist"),
    list("remove", ["delete"], "remove (queue)"),
    list("move-up", ["alt+arrowup"], "move up (queue)"),
    list("move-down", ["alt+arrowdown"], "move down (queue)"),
  ];
}

/** While lyrics show: shift them earlier or later. `nudge` takes milliseconds; false lets the key fall through. */
export function lyricsShortcuts(nudge: (ms: number) => boolean, stepMs: number): Shortcut[] {
  return [
    {
      id: "lyrics-earlier",
      keys: ["["],
      label: `lyrics earlier (${stepMs / 1000} s)`,
      group: "panels",
      scope: "global",
      run: () => nudge(-stepMs),
    },
    {
      id: "lyrics-later",
      keys: ["]"],
      label: `lyrics later (${stepMs / 1000} s)`,
      group: "panels",
      scope: "global",
      run: () => nudge(stepMs),
    },
  ];
}
