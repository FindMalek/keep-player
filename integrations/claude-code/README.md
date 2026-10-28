# keep now playing for Claude Code

What your [lodesong](https://github.com/FindMalek/lodesong) plays, above the Claude Code prompt: the song, the
artist, the playhead, the synced lyric line, and ⏮ ⏸ ⏭ buttons for whichever of your players is playing it. A song
playing in another Subsonic app (Arpeggi on your phone) shows too, without the buttons.

## Install

```
/plugin marketplace add FindMalek/lodesong
/plugin install lodesong-now-playing@lodesong
```

Then in the player: settings → sync → **now playing in your terminal** → connect. It shows one line,
`/lodesong connect https://your-player <token>`: paste it into Claude Code. The token is a sign-in of its own; sign it
out under settings → account → sessions.

## Use

- `/lodesong` or `/lodesong pause`: play / pause
- `/lodesong next`, `/lodesong prev`
- `/lodesong off`: disconnect

The player server needs `ONE_SESSION=on` (the default) for the buttons.
