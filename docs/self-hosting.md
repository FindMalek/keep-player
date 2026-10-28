# Self-hosting

The whole stack on one machine: [Navidrome](https://www.navidrome.org) serving your files, lodesong in front of it,
and the extras you want (uploads, playlists from a prompt, a domain with HTTPS, Lyterion). Written so a person or a
coding agent can follow it top to bottom.

> **For coding agents.** Follow the steps in order. A line marked **ask** is a choice for the person: ask it and wait.
> Never print a secret (passwords, API keys, tokens) to the chat; write them to `.env` and refer to them by name.
> Every step ends with a check and the output to expect. Stop and report if a check doesn't match, and finish with
> [check it works](#check-it-works).

## 0. Decide

**ask** each of these first; the rest of the guide branches on the answers.

| | choice | default |
|---|---|---|
| Navidrome | already running, or a new one with this stack | new |
| music | the folder your music is in (it is mounted read-only) | `~/music` |
| address | local only (`http://<machine>:8080`) or a domain with HTTPS | local |
| uploads | upload from the browser: into a tagging inbox (beets, Lyterion) or straight into the music folder, or off | off |
| prompt playlists | a [Groq](https://console.groq.com/keys) API key for "rainy sunday, slow, warm" playlists, or off | off |
| Lyterion | bring a Spotify library over with [Lyterion](https://github.com/FindMalek/lyterion), or not | not |

## 1. Requirements

- Linux or macOS with Docker 24+ and the compose plugin. The image is **amd64** (a Mac with Apple silicon runs it
  through Docker's emulation; fine for trying, slow for a library of thousands of songs).
- The music folder readable by uid 1000 (Navidrome's and lodesong's user).

```sh
docker compose version     # Docker Compose version v2.x
uname -m                   # x86_64 (or arm64: emulated, see above)
ls "$MUSIC" | head         # your artist folders
```

## 2. Write the stack

```sh
mkdir -p ~/lodesong && cd ~/lodesong
```

`compose.yaml`. With an existing Navidrome, drop the `navidrome` service and set `NAVIDROME_URL` to the address
**this container** reaches it at (usually its service name on a shared Docker network, not `localhost`).

```yaml
services:
  navidrome:
    image: deluan/navidrome:latest
    restart: unless-stopped
    environment:
      ND_SCANSCHEDULE: 1h
      ND_LYRICSPRIORITY: .lrc,embedded
    volumes:
      - navidrome-data:/data
      - ${MUSIC_DIR}:/music:ro
    ports:
      - "4533:4533" # Navidrome's own UI, for the first admin; remove later if you like

  player:
    image: ghcr.io/findmalek/lodesong:latest
    restart: unless-stopped
    depends_on: [navidrome]
    env_file: .env
    environment:
      NAVIDROME_URL: http://navidrome:4533
    ports:
      - "8080:8080"
    volumes:
      - player-data:/data
      # uploads (step 4): - ${UPLOAD_HOST_DIR}:/inbox
    read_only: true
    tmpfs: [/tmp]

volumes:
  navidrome-data:
  player-data:
```

`.env` (keep it out of git, `chmod 600 .env`):

```sh
MUSIC_DIR=/home/you/music
# filled in by step 4 if you want them:
# UPLOAD_DIR=/inbox
# UPLOAD_HOST_DIR=/home/you/music-inbox
# GROQ_API_KEY=
# LYTERION_URL=
# LYTERION_TOKEN=
```

Every other setting has a default: [configuration](configuration.md).

## 3. Start it and make the first account

```sh
docker compose up -d
docker compose ps          # navidrome and player both "running" / "healthy"
```

**ask** the person to open `http://<machine>:4533` and create the Navidrome admin there (Navidrome asks for it on the
first visit; the person picks the password). Navidrome scans the music folder on start and every hour after.

Then open lodesong at `http://<machine>:8080`. Above the sign-in form it checks the server:

- `✓ navidrome 0.6x · 12 ms`: sign in with the Navidrome account.
- `✗ can't reach navidrome`: the container can't reach `NAVIDROME_URL`; see
  [troubleshooting](troubleshooting.md#cant-reach-navidrome).

Check from the machine:

```sh
curl -s http://localhost:8080/api/health
# {"status":"ok","version":"1.x.y","upstreams":[{"id":"default","reachable":true,...}]}
```

## 4. Extras

Each is independent; do the ones chosen in step 0, then `docker compose up -d` again.

### Uploads

Songs and album folders uploaded from settings → library → upload land in `UPLOAD_DIR` inside the container, folders
kept, never overwriting. Admins only.

- **Into a tagging inbox** (recommended): mount an inbox folder that [beets](https://beets.io) or Lyterion imports from,
  so uploads get proper tags and covers before Navidrome sees them.
- **Straight into the music folder**: mount a writable sub-folder of the music folder; Navidrome picks the files up at
  its next scan. The `/music` mount of Navidrome stays read-only.

```sh
mkdir -p ~/music-inbox && sudo chown 1000:1000 ~/music-inbox
# .env
UPLOAD_DIR=/inbox
UPLOAD_HOST_DIR=/home/you/music-inbox
```

Uncomment the `/inbox` volume line in `compose.yaml`.

### Playlists from a prompt

```sh
# .env
GROQ_API_KEY=gsk_...        # write it, don't echo it
```

New playlist → "describe it". Groq gets the names of your artists (with song counts, years, genres and how much you
play them) and answers with artists and an era; the playlist is built from songs you own. [mixes](mixes.md)

### Your other devices

Nothing to set: every open lodesong tab of yours shares one playback session, with a device picker in the player bar.
Phones use a Subsonic app (Arpeggi, Substreamer, Symfonium…) against Navidrome's address; the queue hands off both
ways. [devices](devices.md) · [sync](sync.md)

### Now playing in your terminal

Settings → sync → **now playing in your terminal** makes a token and a one-line command for Claude Code
(`/lodesong connect …`) or the OpenCode plugin. [devices](devices.md#now-playing-in-your-terminal)

### Lyterion

Follow [lyterion](lyterion.md): it runs next to this stack and writes into the same music folder.

## 5. A domain with HTTPS

**ask** for the domain and point its DNS at the machine. With Caddy in the same compose file:

```yaml
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
# and add caddy-data: under volumes
```

```caddy
music.example.com {
  reverse_proxy player:8080
}
```

Add `TRUST_PROXY=true` to `.env` (login rate limits then see the real client address) and remove the `8080:8080`
port. Traefik, nginx and Dokploy: [deploy](deploy/README.md). Whatever the proxy, it must pass WebSockets (the device
picker and listen together use them) and must not buffer audio.

```sh
curl -sI https://music.example.com/healthz     # HTTP/2 200
```

## 6. Keep it running

- **Updates**: `docker compose pull && docker compose up -d`. Pin a version (`lodesong:1.2.0`) to update on your
  own schedule; [releases](https://github.com/FindMalek/lodesong/releases) list what changed.
- **Backups**: the music folder (your files), the `navidrome-data` volume (accounts, playlists, likes, play counts) and
  the `player-data` volume (sessions, listening history, lyrics cache, synced settings). Back up `.env` somewhere
  private.

## Check it works

Run these at the end and report each result:

| check | how | expect |
|---|---|---|
| containers | `docker compose ps` | every service running, the player healthy |
| health | `curl -s http://localhost:8080/api/health` | `"status":"ok"`, the upstream `reachable: true` |
| library | sign in, open albums | your albums, with covers |
| playback | play a song | sound, the progress bar moving |
| lyrics | open lyrics (`l`) on a well-known song | synced or plain lyrics |
| uploads, if on | settings → library → upload, drop one file | "done", the file in the inbox folder |
| prompt playlists, if on | new playlist → describe it → "make it" | a name and "N of your songs" |
| domain, if set | `curl -sI https://<domain>/healthz` | `200` |

Something off: [troubleshooting](troubleshooting.md).
