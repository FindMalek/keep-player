# keep music with Lyterion

[Lyterion](https://github.com/FindMalek/lyterion) brings a Spotify library (liked songs, saved albums, followed artists,
every playlist with its order and cover) over to your own Navidrome, writing verified, tagged files into the music
folder. keep music plays what it places and talks to it in three places.

| where | what |
|---|---|
| **import** (settings → library → import from spotify) | every Spotify playlist with how much of it is in your library, a progress bar each, and the songs still missing |
| **library doctor** | **fix** on a problem (a low-quality file, a fake FLAC) and **fix all shown** hand the songs to Lyterion's `⇪ Upgrade` playlist; it looks for a better copy and replaces the file |
| **add a song** | ⌘K, then paste a YouTube, SoundCloud or Deezer link, or type a song name (admins only). keep music shows what it understood, Lyterion finds a good copy across its sources, checks and places it, and you can play it when it lands |
| **playlists** | Lyterion pushes its playlists into Navidrome as normal playlists, so you can edit them in keep music (and every Subsonic app) |

## Setting them up together

1. **Run Lyterion** next to your stack with its own guide: [Lyterion setup](https://github.com/FindMalek/lyterion/blob/main/docs/setup.md).
   It needs its own Spotify developer app, Postgres and Trigger.dev, and writes into the same music folder Navidrome
   reads (`LYTERION_MUSIC_DIR`, under a `lyterion/` sub-folder by default). Point it at the same Navidrome.
2. **Make a shared token**, at least 24 characters:

   ```sh
   openssl rand -base64 33 | tr -d '/+=' | cut -c1-40
   ```

3. **On Lyterion's api**, set `LYTERION_PLAYER_TOKEN` to it.
4. **On keep music**, in `.env`:

   ```sh
   LYTERION_URL=http://lyterion-api:3001   # Lyterion's api as the keep music container reaches it
   LYTERION_TOKEN=<the same token>
   ```

   and `docker compose up -d`. Both must be set, or neither.

Check: settings → library → **import from spotify** shows your playlists with "N of M songs in". Without Lyterion that
page takes a Spotify export file instead ([spotify import](spotify-import.md)).

## Uploads into Lyterion's inbox

keep music's uploads ([self-hosting](self-hosting.md#uploads)) can land in an inbox Lyterion or beets imports from:
set `UPLOAD_DIR` to that folder, mounted writable.

## What goes where

keep music never downloads anything and never writes into the music folder itself (uploads only land in `UPLOAD_DIR`).
Where songs come from is Lyterion's business and is configured there.
