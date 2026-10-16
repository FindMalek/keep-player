# Demo library

A copyright-free library for screenshots, previews and trying the player without your own music. Everything is
generated: synthesized tracks (small generative pieces), dithered monochrome covers, tags, some synced lyrics and a few
playlists. It is deterministic, so the same seed gives the same library.

```sh
bun run demo:library ./demo-music            # 19 albums, ~160 tracks, 30 s each (about 150 MB)
bun run demo:library ./demo-music --seconds 10 --seed 7
```

Needs `ffmpeg` on the path. Tracks are FLAC (about two thirds), Opus 160 and MP3 256, so quality badges and the library
doctor have a believable mix. Each folder has a `cover.png` (and FLAC/MP3 files embed it); `Playlists/*.m3u8` use
relative paths, which Navidrome imports as playlists.

## Try it with Navidrome

```sh
docker compose -f compose.demo.yaml up -d
```

Navidrome serves `./demo-music` on http://localhost:4533. Create the `demo` user (password `demo`) on first visit, then
run the player against it (see [configuration](configuration.md)). PR previews use this same library and account.
