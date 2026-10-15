# Lyrics

The lyrics panel (`y`), full-screen view (`⇧F`) and lyrics search all use the same lyrics, found in this order:

1. **Navidrome**: lyrics embedded in the file or a `.lrc` next to it (synced preferred).
2. **LRCLIB** exact match: title, artist, album and duration (within 2 s).
3. **LRCLIB** search: title and artist, the closest duration within 5 s.
4. Plain (unsynced) lyrics from either, or **instrumental** when LRCLIB knows the track has none.

Titles are cleaned before asking LRCLIB ("(Remastered 2011)", "- Live", "feat. X", "[Explicit]" go), and the album
artist is tried when the track artist differs.

## Caching and backfill

Everything found, and everything not found, is cached in `$DATA_DIR/library.db`. A miss is asked again after 30
days, because LRCLIB grows every day. With `LYRICS_BACKFILL=on` (the default) the server walks the library in the
background, one song every ~0.6 s with backoff, so lyrics for songs nobody opened yet are ready (and searchable)
before they play. `LRCLIB_URL=` (empty) turns LRCLIB off entirely; only Navidrome's lyrics are used then.

When a song starts, the lyrics for the next two in the queue are fetched too.

## Following along

- Synced lyrics follow the song and the current line stays centred; scroll yourself and it waits 4 s (or press "back
  to the current line") before following again.
- Word-by-word highlighting when the lyrics carry word timings (enhanced LRC).
- Click a line to jump there.
- **Off by a bit?** `[` and `]` shift the lyrics 0.25 s earlier or later. The offset is saved per song on the
  server, so it follows you to every browser.

## Getting lyrics into other apps

Lyrics fetched here live in keep music's cache, so Arpeggi and other Subsonic apps don't see them. To share them,
write them into the files: [beets](https://beets.io) with the `lyrics` plugin (`synced: yes`), or a tool that writes
`.lrc` files next to the audio. Navidrome picks those up on its next scan (`ND_LYRICSPRIORITY=.lrc,embedded`).
