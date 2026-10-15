# Import from Spotify

Rebuild your Spotify playlists and liked songs from a Spotify data export. Settings → library → *import from spotify*
(or `/import`).

1. Ask Spotify for your data (account → privacy → download your data). The files you need are `Playlist1.json` (more
   if you have many playlists) and `YourLibrary.json` for liked songs.
2. Drop the files on the page. A plain shape of our own works too:
   `{"playlists": [{"name": "…", "tracks": [{"title": "…", "artist": "…"}]}], "liked": [{"title": "…", "artist": "…"}]}`.
3. *match with my library* looks every distinct track up in your Navidrome (through the search index, so only songs you
   may see): an ISRC if both sides have one, otherwise title and artist (exact, then typo-tolerant), with the duration
   as a tie-break.
4. Check the result. **matched** is sure (85% and up), **review** is likely, **missing** has nothing close. *change*
   searches your library for the right song; *skip* leaves a track out.
5. *create playlists and stars* makes each playlist (in the folder you name) and stars the liked songs. Run it again
   after fixing matches or adding music: playlists made before are rewritten, not duplicated.
6. *missing list (csv)* downloads what nothing matched (and what you skipped): artist, title, album, ISRC, for whatever
   gets you the music.
