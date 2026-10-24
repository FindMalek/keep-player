# keep now playing for Claude Code

What your [keep-player](https://github.com/FindMalek/keep-player) plays, above the Claude Code prompt: the song, the
artist, the playhead, the synced lyric line, and ⏮ ⏸ ⏭ buttons for whichever of your players is playing it. A song
playing in another Subsonic app (Arpeggi on your phone) shows too, without the buttons.

## Install

```
/plugin marketplace add FindMalek/keep-player
/plugin install keep-now-playing@keep-player
```

Then in the player: settings → sync → **now playing in your terminal** → connect. It shows one line,
`/music connect https://your-player <token>`: paste it into Claude Code. The token is a sign-in of its own; sign it
out under settings → account → sessions.

## Use

- `/music` or `/music pause`: play / pause
- `/music next`, `/music prev`
- `/music off`: disconnect

The player server needs `ONE_SESSION=on` (the default) for the buttons.
