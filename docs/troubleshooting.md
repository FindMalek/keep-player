# Troubleshooting

First stop: `https://<your lodesong>/api/health`. It says, per configured server, whether lodesong reaches it,
how fast, and what it is.

## Can't reach Navidrome

The sign-in screen says `can't reach navidrome`, `/api/health` shows `"reachable": false`.

- `NAVIDROME_URL` is what **the container** uses. `localhost` inside a container is the container itself; use the
  Navidrome service name (`http://navidrome:4533`) and put both on one Docker network (`networks:` in both
  composes, or one compose with both services).
- Test from inside: `docker compose exec player wget -qO- "$NAVIDROME_URL/rest/ping"` should print JSON.

## "The server answered, but it isn't Navidrome"

`NAVIDROME_URL` points at something else: often a reverse proxy's web page, or the wrong port. It must be the base
URL that has `/rest/ping` under it.

## "Wrong username or password" with the right password

- The account is the **Navidrome** account (case-sensitive user name).
- After 3 wrong tries each further one waits longer (1 s, 2 s, 4 s … up to 15 min), per IP and per user; the
  message says how long.
- Behind a reverse proxy, set `TRUST_PROXY=true`, or every user shares the proxy's IP for rate limits.

## Songs start slowly or skip

- Look at the browser's network panel: each `/rest/stream` response has `Server-Timing: upstream;dur=…`, the time
  Navidrome took to answer. Seconds there mean Navidrome itself is slow (a full scan running, a busy disk).
- Large FLACs over a slow link: the next songs only download after the current one is buffered, but a very slow
  connection can still stall. The player waits as long as bytes keep arriving and only gives up on a stream that
  is silent for 8 s, four times.
- "it's in a format this browser can't play": the browser has no decoder for the file type (e.g. ALAC in
  Firefox). Navidrome can transcode; see its docs.

## Streams cut off behind a proxy

Disable response buffering and allow long responses (nginx: `proxy_buffering off; proxy_read_timeout 1h;`). See
[deploy](deploy/README.md#reverse-proxies).

## Search misses songs or lyrics

User menu → library index (admins): counts, last sync, "rebuild now". The index syncs after Navidrome scans; a song
added a minute ago appears after the next scan. Lyrics are searchable once fetched; the backfill takes about a second
per song.

## Bad configuration

The server refuses to start and lists every bad variable:

```
keep-player: can't start, fix the configuration (see docs/configuration.md):
  - PORT must be a whole number from 1 to 65535, got "eighty"
```

## Reset a browser

User menu → offline storage → clear, then log out. That removes this account's cached music, covers and queue
from the browser.
