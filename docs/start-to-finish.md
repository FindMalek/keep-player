# Start to finish

From nothing to the whole setup: your music on your own server, a player that feels like Spotify on every computer you
use, your Spotify library brought over, and the song in your Mac's notch. Each step links to the page with the details;
this one is the route.

## What you'll have

- **Navidrome** serving your music folder, and **keep music** in front of it, in one Docker Compose stack.
- **Lyterion** (optional) bringing a Spotify library over and keeping it in step every day.
- keep music in every browser you use, as **one session**; the **Mac app** with the notch island; your **phone** on a
  Subsonic app against the same Navidrome.

Plan an hour for the first two steps, a bit more if you bring a Spotify library over.

## 1. Run the stack

Follow [self-hosting](self-hosting.md) top to bottom (a person or a coding agent can): it writes `compose.yaml` and
`.env`, starts Navidrome and keep music, creates the first Navidrome account, and ends with a checklist. If you only want
to try it next to a Navidrome you already run, [getting started](getting-started.md) is shorter.

When it's done, `http://<machine>:8080` shows the sign-in page with `✓ navidrome` above it, and your albums after you
sign in.

## 2. Give it an address

Local only is fine at home. To use it from anywhere, put it behind a domain with HTTPS: [self-hosting, step
5](self-hosting.md#5-a-domain-with-https) for Caddy, [deploy](deploy/README.md) for Traefik, nginx and Dokploy. Whatever
proxy you use must pass WebSockets (the device picker and listen together use them). A tailnet (Tailscale) instead of a
public domain works too.

## 3. Your music

- **The folder** Navidrome reads is the library. Anything you add there shows up after Navidrome's next scan (hourly
  by default).
- **Uploads from the browser** (settings → library → upload) go into an inbox; point beets or Lyterion at it so files
  arrive tagged, with covers. [self-hosting, uploads](self-hosting.md#uploads)
- **Lyrics** come from your `.lrc` files and LRCLIB; keep music can write the ones it finds next to your files so other
  apps get them too. [lyrics](lyrics.md)

## 4. Bring a Spotify library over (optional)

[Lyterion](lyterion.md) reads your Spotify library (liked songs, saved albums, followed artists, every playlist with its
order and cover) and places verified, tagged files into the same music folder. Set it up with its own guide, then connect
the two with one shared token; keep music then shows each playlist's progress, and its library doctor hands bad files to
Lyterion to replace.

Once the first import is done, Lyterion's daily sync picks up what you like, save or add to playlists on Spotify, and
stars your likes in Navidrome, until you turn it off. What it couldn't verify waits in its review page.

## 5. Every device

- **Other browsers** of yours join one playback session automatically: press play anywhere and the rest become remotes.
  [devices](devices.md)
- **The Mac app**: download `keep-music-macos.zip` from the [latest release](https://github.com/FindMalek/keep-player/releases/latest),
  unzip, move it to Applications and open it with right-click → Open the first time (it isn't notarized). Give it your
  keep music address. The song lives in the notch; it updates itself.
- **Your phone**: any Subsonic app (Arpeggi, Symfonium, Substreamer) against Navidrome's address and the same account.
  The queue hands off between phone and computer, and mixes show up there as playlists. [sync](sync.md)
- **Your terminal**: settings → sync → now playing in your terminal, for Claude Code or OpenCode.
  [devices](devices.md#now-playing-in-your-terminal)

## 6. Make it yours

- **Mixes** (daily mixes, discover weekly, the daylist) need a few days of listening first. [mixes](mixes.md)
- **Playlists from a prompt** and the mood mixes need a Groq API key in `.env` (`GROQ_API_KEY`). [mixes](mixes.md#playlists-from-a-prompt)
- **Shortcuts**: everything has a key; `?` shows them all. [shortcuts](shortcuts.md)
- **Your own tools**: settings → sync → api token, then the reference at `/api`. [api](api.md)

## 7. Keep it running

- **Updates**: `docker compose pull && docker compose up -d`, or pin a version and update on your schedule.
- **Backups**: the music folder, Navidrome's data volume (accounts, playlists, likes, play counts), keep music's data
  volume (sessions, history, lyrics cache, synced settings) and `.env`. [self-hosting, keep it
  running](self-hosting.md#6-keep-it-running)
- **Something off**: [troubleshooting](troubleshooting.md). Every setting: [configuration](configuration.md).
