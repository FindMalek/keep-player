# Queue hand-off with Arpeggi (and other clients)

keep music and Arpeggi share one thing on the server: the Subsonic **play queue** (what's queued, which song is
current, and how far into it). Each browser saves under its own client name, `keep-player@<id>`, so the app can
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
| 1 | play an album in Arpeggi, pause at ~2:14, open keep music on the desktop | "continue from Arpeggi · song at 2:14"; resume here loads that song paused at 2:14 with the rest of the queue | pending |
| 2 | play on the desktop, pause, open Arpeggi | Arpeggi offers or loads the same queue and position | pending |
| 3 | play on the desktop, close the tab mid-song, open Arpeggi | the queue continues from about where the tab closed | pending |
| 4 | while the desktop plays, pause something else in Arpeggi, switch back to the tab | only an offer, playback keeps going | pending |
| 5 | press keep mine, reload the desktop | not asked again for that save | pending |
| 6 | queue 600+ songs on the desktop, pause, open Arpeggi | the full queue arrives (form POST, no URL limit) | pending |

Fill in the results after a run and note the Navidrome and Arpeggi versions used.
