# Devices

## One session across devices

Every open lodesong of yours (a tab, another browser, another computer) joins one playback session, like Spotify
Connect. One of them plays; the others are remotes.

- **Press play anywhere** and that device takes over: the one that was playing stops, the rest follow it.
- **Remotes** show the same song, queue and progress. Play, pause, next, previous, seeking, picking a song, "play
  next" and "add to queue" all go to the device that plays.
- **The device picker** (speaker icon in the player bar, shown once there are two devices) lists them with the playing
  one checked; pick one to move playback there, from where it was. "playing on chrome on mac" shows next to the
  controls while another device plays.
- Remotes don't count plays, scrobble or show the old "continue from your other browser" offer, so nothing is counted
  twice.
- A device that drops (a laptop closing) leaves the session paused where it was; any device picks it up.

It is per account and needs nothing set up. `ONE_SESSION=off` on the server goes back to every tab playing on its own
([configuration](configuration.md)). The server passes the session over a WebSocket, so a reverse proxy in front must
allow WebSockets ([deploy](deploy/README.md#reverse-proxies)).

**Phones** use a Subsonic app against Navidrome directly (Arpeggi, Substreamer, Symfonium…). Those can't be remote
controlled; the queue hands off through Navidrome instead: [sync](sync.md).

## Now playing in your terminal

A line above the prompt of Claude Code or OpenCode: the song, the artist, the progress, the device, the synced lyric
line, and ⏮ ⏸ ⏭ for whichever player of yours is playing. A song playing in another Subsonic app (your phone) shows
too, without the buttons.

1. In lodesong: settings → sync → **now playing in your terminal** → connect. It shows one line,
   `/lodesong connect https://your-player <token>`, once.
2. **Claude Code**:

   ```text
   /plugin marketplace add FindMalek/lodesong
   /plugin install lodesong-now-playing@lodesong
   ```

   then paste the line from step 1. `/lodesong` plays or pauses, `/lodesong next`, `/lodesong prev`,
   `/lodesong off` disconnects.
3. **OpenCode** (2.x): point `~/.config/opencode/cli.json` at the plugin folder of a lodesong clone, with the URL and
   the token from step 1 as options:

   ```json
   {
     "plugins": [
       {
         "package": "/path/to/lodesong/integrations/opencode",
         "options": { "url": "https://your-player", "token": "<token>" }
       }
     ]
   }
   ```

   `/music`, `/music next`, `/music prev`.

The token is a sign-in of its own: it shows under settings → account → sessions as "terminal · now playing", and
signing it out there disconnects the terminal. It can only read what's playing and play, pause or skip.

The endpoints, for anything else that wants them (a status bar, a stream deck), all with
`Authorization: Bearer <token>`:

| | |
|---|---|
| `GET /api/remote/now` | `{ song, position, playing, device, line, controllable }` |
| `POST /api/remote/toggle` · `next` · `previous` | to the playing device; `409` when none of yours plays |
