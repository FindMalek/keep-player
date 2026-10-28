# Architecture

```
 browser                                   lodesong server (Bun, one executable)              upstream
┌──────────────────────────┐   cookie   ┌──────────────────────────────────────────┐
│ React app (shadcn/ui)     │──────────▶│ /auth/*      sessions (SQLite, encrypted)  │
│  player engine, 2 decks   │           │ /rest/*      Subsonic proxy, adds the      │──────▶ Navidrome
│  TanStack Query + IDB     │◀──────────│              session's token, Range, abort │        (any OpenSubsonic)
│ service worker            │  audio    │ /cover/:id   resized WebP, disk LRU cache  │──────▶
│  app shell, covers,       │           │ /api/search  FTS5 index of the library     │
│  next 3 songs (Range)     │           │ /api/lyrics  Navidrome → LRCLIB, cached    │──────▶ lrclib.net
└──────────────────────────┘           │ /api/health  readiness, per server         │
                                        │ /api/history, offsets, hidden songs…       │
                                        └───────────────┬───────────────────────────┘
                                                        │ $DATA_DIR
                                         sessions.db · library.db · covers/ · session.secret
```

## Server (`apps/api/src`)

- **One origin.** The app, the API and the audio come from the same host: no CORS, cookies just work, and Web
  Audio can process the stream (ReplayGain, gapless handover, fades).
- **Sessions** (`sessions.ts`): login turns the password into a Subsonic token (`md5(password + salt)`), checks it
  against Navidrome and stores it encrypted (AES-GCM with `SESSION_SECRET`). The browser holds an httpOnly cookie;
  tokens never appear in browser storage or URLs, so audio and cover URLs are stable and cacheable.
- **Proxy** (`api.ts`): an allowlist of Subsonic endpoints. Strips any client credentials, adds the session's,
  passes `Range` through for seeking, and aborts the upstream request when the browser drops it.
- **Upstreams** come only from config (`NAVIDROME_URL` / `NAVIDROME_SERVERS`), never from a request, so the proxy
  can't be pointed elsewhere.
- **Search index** (`search-index.ts`, `search.ts`): FTS5 tables (words and trigrams) over songs, albums, artists
  and lyrics, synced after Navidrome scans. Results are filtered to the requester's music folders.
- **Lyrics** (`lyrics.ts`, `backfill.ts`): Navidrome first, LRCLIB fallback, hits and misses cached, a polite
  background backfill. See [lyrics](lyrics.md).
- **Covers** (`covers.ts`): fetched once per id and size step, converted to WebP, kept in an LRU on disk, served
  `immutable`.
- **Config** (`settings.ts`): one table of every variable, checked at boot, rendered into
  [configuration](configuration.md).

In production the web app is bundled, minified and precompressed (brotli, gzip) and embedded in the executable with
the server (`scripts/build.ts`). The image is that executable on Alpine, multi-arch.
- **Devices** (`devices.ts`): one in-memory hub per account over WebSockets (`/api/devices`): which device plays,
  its last state, commands from remotes routed to it, transfers. The remote API (`remote.ts`, `/api/remote/*`) reads
  it with a Bearer session for the terminal mods.
- **Mixes** (`mixes.ts`): daily mixes, discover weekly and the daylist from your plays (matched to the library by
  artist and title) and the index, seeded per day so every device gets the same picks.
- **Prompt playlists** (`ai-playlist.ts`): a catalog of your artists to Groq, artists back, the list built from songs
  you own.

## Web app (`apps/player/src`)

- **Player engine** (`lib/player.ts`, `lib/decks.ts`): two `<audio>` decks, each through its own gain node.
  The playing deck plays; the idle one holds the next song. A few ms before the end the idle deck starts and they
  swap (gapless). Downloads ahead only start once the playing song is safely buffered, so they never starve it.
  A stall watchdog reloads a stream only when no bytes arrive for 8 s.
- **Queue** (`lib/queue.ts`): history, "your queue" (play next / add), and the context (album, playlist…), with a
  balanced shuffle. Pure functions with unit tests.
- **State:** the player is an external store read through selectors, and the playback position is a separate
  ticker, so lists don't re-render while music plays. Library data goes through TanStack Query, persisted to
  IndexedDB per account, so a reload paints instantly.
- **Lists** are virtualized (`@tanstack/react-virtual`): a 10k-song list keeps ~40 rows in the DOM.
- **Service worker** (`sw.ts`): app shell for offline, covers cache-first, and the next songs downloaded one at a time
  at low priority into an LRU audio cache that serves Range requests (instant seeks, offline playback).
- **Shortcuts** (`lib/shortcuts.ts`, `app-shortcuts.ts`): one registry with scopes and chords; the `?` sheet,
  tooltips, the palette and [shortcuts](shortcuts.md) all read it.
- **UI:** shadcn/ui on Base UI plus the audiocn registry, themed by tokens only (monochrome, square). See
  [CONTRIBUTING](../CONTRIBUTING.md).

## Sync with other clients

Only standard (Open)Subsonic data on the server: the play queue (hand-off), stars and ratings, playlists and
scrobbles. Any client sees the same. See [sync](sync.md).
