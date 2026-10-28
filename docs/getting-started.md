# Getting started

You need a running [Navidrome](https://www.navidrome.org) (or any OpenSubsonic server) and Docker. Setting up
everything from scratch (Navidrome, uploads, AI playlists, a domain, Lyterion), or having a coding agent do it:
[self-hosting](self-hosting.md).

## 1. Run it

Next to an existing Navidrome, on the same Docker network:

```yaml
services:
  player:
    image: ghcr.io/findmalek/keep-player:latest
    restart: unless-stopped
    environment:
      NAVIDROME_URL: http://navidrome:4533
    ports:
      - "8080:8080"
    volumes:
      - player-data:/data
volumes:
  player-data:
```

```sh
docker compose up -d
```

No Navidrome yet? [`deploy/full-stack.compose.yaml`](deploy/full-stack.compose.yaml) runs both. Behind a domain:
[deploy/README.md](deploy/README.md) (Traefik, Caddy, nginx, Dokploy).

`NAVIDROME_URL` is the address **this container** uses, not your browser: usually the Navidrome service name on a
shared Docker network. Every other setting has a default ([configuration](configuration.md)).

## 2. Sign in

Open `http://localhost:8080`. Above the form, lodesong checks the server:

- `✓ navidrome 0.64.2 · 12 ms` — all good. Sign in with any Navidrome account.
- `✗ can't reach navidrome` — the container can't reach `NAVIDROME_URL`. See
  [troubleshooting](troubleshooting.md#cant-reach-navidrome).

Your password goes to the lodesong server only, which turns it into a Subsonic token, checks it with Navidrome and
keeps it encrypted. The browser gets a session cookie and never sees the token ([security](security.md)).

## 3. First run

Right after the first sign-in in a browser:

1. **Make it yours:** theme, how much music to keep for offline (the next songs download ahead so they start
   instantly), and whether to pick up where your phone left off.
2. **Three things worth knowing:** `⌘K` searches everything (even lyrics), `?` lists every shortcut, and the queue
   follows you between devices.

## 4. Next

- Learn the keyboard: press `?`, or read [shortcuts](shortcuts.md).
- Search tricks: [search](search.md).
- Lyrics everywhere: [lyrics](lyrics.md).
- Use your phone too: [sync](sync.md). Your other computers: [devices](devices.md).
- Mixes, prompt playlists and the recap: [mixes](mixes.md).
