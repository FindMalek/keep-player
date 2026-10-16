# Listen together

One person hosts, others on the same Navidrome server follow. Open the menu under your name → **listen together**.

- **Start a session** and share the link (`/listen/<code>`). Anyone who signs in to this server with their own account can open it and hears what you play, in sync: same song, same play state, and the playhead is corrected when it drifts more than 0.25 s.
- **Everyone can add songs**: a listener searches the library and adds a song; it lands on the host's queue and shows in the activity list with their name.
- **The host controls playback.** Turn on *anyone can skip* to let listeners skip too.
- **Each listener plays through their own account**, so their plays are scrobbled and their stars stay theirs.
- A reload rejoins the session. If the host stays away for a minute, the session ends.

## How it works

The host's browser sends its state (song, position, playing) over a WebSocket (`/api/listen/<code>`) when the song or play state changes and every 5 s. The server stamps each state with its own clock; a listener places the playhead from that stamp and its measured clock offset, so two machines' clocks never have to agree. Sessions live in the server's memory: a restart ends them.

## Not built yet

"Listening on this device only" (a party mode where one machine plays and the others are remotes) is not in this version.
