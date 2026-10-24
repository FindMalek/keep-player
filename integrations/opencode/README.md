# keep now playing for OpenCode

What your [keep-player](https://github.com/FindMalek/keep-player) plays, in OpenCode's prompt footer: the song, the
artist, the playhead and the synced lyric line. `/music`, `/music next` and `/music prev` play, pause and skip whichever
of your players is playing it (OpenCode 2).

## Install

Make a token in the player: settings → sync → **now playing in your terminal** → connect. The line it shows ends with
the token. Then, with this folder on disk (a clone of keep-player), add it to `~/.config/opencode/cli.json`:

```json
{
  "plugins": [
    {
      "package": "/path/to/keep-player/integrations/opencode",
      "options": { "url": "https://your-player", "token": "<token>" }
    }
  ]
}
```

The token is a sign-in of its own; sign it out under settings → account → sessions.
