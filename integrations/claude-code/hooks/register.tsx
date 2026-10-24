import type { EngineInterface, Register } from "claude-code";
import { atom, read, update } from "claude-code";

import type { Now } from "../types";

/*
 * keep-player's now playing above the prompt: song, artist, playhead, the synced lyric line, and ⏮ ⏯ ⏭ for whichever
 * of your players is playing. `/music connect <url> <token>` once (the player's settings → sync makes the line).
 */

const POLL_MS = 2000;
const BAR = 16;

const now = atom({ plugin: "keep-now-playing", key: "now" } as const, null);
const error = atom({ plugin: "keep-now-playing", key: "error" } as const, null);

type Link = { url: string; token: string };

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function bar(position: number, duration: number): string {
  const filled = Math.max(0, Math.min(BAR, Math.round((position / duration) * BAR)));
  return "━".repeat(filled) + "─".repeat(BAR - filled);
}

async function link($: EngineInterface): Promise<Link | null> {
  const saved = (await $.store.get("link")) as Link | undefined;
  return saved?.url && saved.token ? saved : null;
}

async function call($: EngineInterface, path: string, method = "GET") {
  const target = await link($);
  if (!target) return null;
  return $.http.fetch(`${target.url}${path}`, { method, headers: { authorization: `Bearer ${target.token}` } });
}

async function poll($: EngineInterface): Promise<void> {
  const response = await call($, "/api/remote/now").catch(() => null);
  if (!response) return;
  if (response.status === 401) {
    await update($, error, () => "signed out: make a new line in the player (settings → sync)");
    await update($, now, () => null);
    return;
  }
  if (!response.ok) return;
  await update($, error, () => null);
  await update($, now, () => JSON.parse(response.text) as Now);
}

async function control($: EngineInterface, action: "toggle" | "next" | "previous"): Promise<string> {
  const response = await call($, `/api/remote/${action}`, "POST").catch(() => null);
  if (!response) return "not connected: /music connect <url> <token>";
  if (response.status === 409) return "nothing of yours is playing in keep-player (arpeggi can't be controlled from here)";
  if (!response.ok) return `the player said ${response.status}`;
  await poll($);
  return "";
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "music",
      description: "keep-player: connect <url> <token> · pause · next · prev · off",
    });
    void poll($);
    $.clock.every(POLL_MS, () => void poll($));
    return next(e);
  });

  on("command.run", { command: "music" }, async ($, e) => {
    const [verb = "", ...rest] = e.args.trim().split(/\s+/);
    if (verb === "connect") {
      const [url, token] = rest;
      if (!url || !token || !/^https?:\/\//.test(url)) return { text: "usage: /music connect https://your-player <token>" };
      await $.store.set("link", { url: url.replace(/\/+$/, ""), token });
      await poll($);
      return { text: (await read($, error)) ?? `connected to ${url}` };
    }
    if (verb === "off") {
      await $.store.delete("link");
      await update($, now, () => null);
      return { text: "disconnected" };
    }
    const action =
      verb === "next"
        ? "next"
        : verb === "prev" || verb === "previous"
          ? "previous"
          : verb === "" || verb === "pause" || verb === "play"
            ? "toggle"
            : null;
    if (!action) return { text: "usage: /music [pause | next | prev | connect <url> <token> | off]" };
    const said = await control($, action);
    return { text: said || undefined };
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const playing = await read($, now);
    const problem = await read($, error);
    if (e.props.hasSurvey || (!playing?.song && !problem)) return next(e);
    const { Box, Button, Text } = $.ui.resolve(e);
    if (!playing?.song) return <Text dimColor>♪ {problem}</Text>;
    const { song, position, line } = playing;
    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text dimColor={!playing.playing}>{playing.playing ? "♪" : "‖"}</Text>
          <Text bold>{song.title}</Text>
          {song.artist ? <Text dimColor>{song.artist}</Text> : null}
          {position !== null && song.duration ? (
            <Text dimColor>
              {clock(position)} {bar(position, song.duration)} {clock(song.duration)}
            </Text>
          ) : null}
          {playing.device ? <Text dimColor>on {playing.device}</Text> : null}
          {playing.controllable ? (
            <>
              <Button key="previous" label="⏮" onPress={() => void control($, "previous")} />
              <Button key="toggle" label={playing.playing ? "⏸" : "▶"} onPress={() => void control($, "toggle")} />
              <Button key="next" label="⏭" onPress={() => void control($, "next")} />
            </>
          ) : null}
        </Box>
        {line ? (
          <Text italic dimColor>
            {" "}
            {line}
          </Text>
        ) : null}
      </Box>
    );
  });
};
