# Queue hand-off with Arpeggi (and other clients)

> Between lodesong tabs and computers, playback is one session with a device picker: [devices](devices.md). This page
> is about Subsonic apps on your phone, which hand the queue off through Navidrome.

lodesong and Arpeggi share one thing on the server: the Subsonic **play queue** (what's queued, which song is
current, and how far into it). Each browser saves under its own client name, `lodesong@<id>`, so the app can
tell its own saves from the phone's.

## How it behaves

- **Saving:** on pause, when the song changes, every 15 s while playing, and when the tab is hidden or closed
  (sent with `keepalive`). The queue goes as a form POST (no URL limit for long queues), with the OpenSubsonic
  index-based endpoints when Navidrome offers them, so a song queued twice keeps its place.
- **Reading:** on sign-in, when the tab comes back into focus, and when the network comes back. If another device
  saved something newer than this browser's last save, a toast offers it: "continue from Arpeggi · song at 2:14",
  **resume here** or **keep mine**. Keep mine is remembered for that save.
- **Never yanks playback:** while this tab plays, it only asks. "Pick up their queue without asking" (user menu)
  takes it silently, and only when nothing is playing here.
- **Off switch:** "sync the queue with your other devices" in the user menu.

## Manual test plan (Arpeggi on iPhone)

Run against the real server; the automated tests (`e2e/queue-sync.e2e.ts`) cover the same flows against the mock.

| # | steps | expected | result |
|---|---|---|---|
| 1 | play an album in Arpeggi, pause at ~2:14, open lodesong on the desktop | "continue from Arpeggi · song at 2:14"; resume here loads that song paused at 2:14 with the rest of the queue | pending |
| 2 | play on the desktop, pause, open Arpeggi | Arpeggi offers or loads the same queue and position | pending |
| 3 | play on the desktop, close the tab mid-song, open Arpeggi | the queue continues from about where the tab closed | pending |
| 4 | while the desktop plays, pause something else in Arpeggi, switch back to the tab | only an offer, playback keeps going | pending |
| 5 | press keep mine, reload the desktop | not asked again for that save | pending |
| 6 | queue 600+ songs on the desktop, pause, open Arpeggi | the full queue arrives (form POST, no URL limit) | pending |

Fill in the results after a run and note the Navidrome and Arpeggi versions used.

## Lyrics in Arpeggi and other clients

lodesong looks up lyrics Navidrome doesn't have on LRCLIB and keeps them in its own database, so by default only
lodesong shows them. The lyrics page (user menu → lyrics coverage) shows how much of the library has synced, plain
or no lyrics, the albums missing the most, and every song nothing was found for. Admins can ask LRCLIB again for all
misses at once.

To give every Subsonic client the same lyrics, turn on `.lrc` sidecars:

1. Mount Navidrome's music folder into lodesong **writable**, and set `MUSIC_DIR` to where it is mounted
   (for example `- /srv/music:/music` and `MUSIC_DIR=/music`).
2. Set `LYRICS_WRITE_LRC=on`.
3. In Navidrome, enable **Report Real Path** for the lodesong player (Settings → Players), so songs carry their file
   path. lodesong matches Navidrome's path to the mount even when the two mount points differ.
4. Navidrome picks the `.lrc` files up on its next scan (`ND_LYRICSPRIORITY` must include `.lrc`, which it does by
   default).

lodesong never overwrites a file: a `.lrc` that is already there wins. Each write is logged, and "remove N .lrc
files" on the lyrics page deletes them again, except files someone edited since.

The trade-off: with it off (the default), lodesong never writes to your library, and other clients only see lyrics
Navidrome already had.
