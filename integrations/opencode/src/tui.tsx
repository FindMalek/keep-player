/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import { createSignal, Show } from "solid-js";

/*
 * lodesong's now playing in OpenCode's prompt footer: song, artist, playhead and the synced lyric line, and /music
 * to play, pause and skip whichever of your players is playing. `url` and `token` come from cli.json's options.
 */

interface Now {
  song: { id: string; title: string; artist?: string; duration?: number } | null;
  position: number | null;
  playing: boolean;
  device: string | null;
  line: string | null;
  controllable: boolean;
}

const POLL_MS = 2000;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export default Plugin.define({
  id: "keep.now-playing",
  setup(context) {
    const url = typeof context.options.url === "string" ? context.options.url.replace(/\/+$/, "") : "";
    const token = typeof context.options.token === "string" ? context.options.token : "";
    const [now, setNow] = createSignal<Now | null>(null);
    if (!url || !token) {
      context.ui.toast.show({ message: "keep now playing: set url and token in cli.json", variant: "warning" });
      return;
    }
    const headers = { authorization: `Bearer ${token}` };

    const poll = async () => {
      const response = await fetch(`${url}/api/remote/now`, { headers }).catch(() => null);
      if (response?.ok) setNow((await response.json()) as Now);
      else if (response?.status === 401) setNow(null);
    };

    const control = async (action: "toggle" | "next" | "previous") => {
      const response = await fetch(`${url}/api/remote/${action}`, { method: "POST", headers }).catch(() => null);
      if (response?.status === 409) context.ui.toast.show({ message: "nothing of yours is playing in lodesong" });
      await poll();
    };

    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "lodesong",
          title: "lodesong: play/pause, next, prev",
          group: "lodesong",
          palette: true,
          slash: { name: "music", arguments: true },
          run: async (input?: string) => {
            const verb = (input ?? "").trim();
            await control(verb === "next" ? "next" : verb === "prev" || verb === "previous" ? "previous" : "toggle");
          },
        },
      ],
      bindings: ["lodesong"],
    }));

    context.ui.slot({
      append: "prompt.footer.status",
      render: () => (
        <Show when={now()?.song}>
          {(song) => (
            <text fg={context.theme.text.base}>
              {now()?.playing ? "♪" : "‖"} {song().title}
              {song().artist ? ` · ${song().artist}` : ""}
              {now()?.position != null && song().duration ? ` ${clock(now()?.position ?? 0)}/${clock(song().duration ?? 0)}` : ""}
              {now()?.line ? `  “${now()?.line}”` : ""}
            </text>
          )}
        </Show>
      ),
    });

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  },
});
