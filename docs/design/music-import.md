# Music import with AI metadata fill

Plan for [#183](https://github.com/FindMalek/lodesong/issues/183): bring missing music into the library with full
metadata and have Navidrome pick it up.

## Where it lives

Not in the player. Finding, downloading, verifying and tagging files is Lyterion's job, and Lyterion already has the
pieces:

- files and tags for your own files: [lyterion#161](https://github.com/FindMalek/lyterion/issues/161)
- searching outside the library: [lyterion#132](https://github.com/FindMalek/lyterion/issues/132)

lodesong stays the front door: it already hands songs to Lyterion from **add a song** (⌘K) and the library doctor
([Lyterion guide](../lyterion.md)). This issue is the missing pieces on that path.

## What lodesong adds

1. **Missing artist view.** On an artist (or from a list like "Big Roshi, Shyler, TY"), a "find missing" action asks
   Lyterion for what exists outside the library and shows it next to what you own.
2. **Metadata fill from the player.** For files with thin tags, the doctor offers "fill tags", which hands the file to
   Lyterion; Lyterion writes the tags (AI only suggests, sources decide) and Navidrome rescans.
3. **Progress.** The add-a-song progress UI is reused: lookup, download, verify, place, play.

## Contract needed from Lyterion

| call | purpose |
|---|---|
| `POST /player/search` `{ artist, title? }` | candidates outside the library |
| `POST /player/fetch` `{ id }` | download, verify, tag, place |
| `POST /player/retag` `{ path }` | fill metadata of an owned file |

Same shared token as today (`LYTERION_TOKEN`). Nothing here works without Lyterion; without it the actions are hidden.

## Order

1. agree the three calls in Lyterion
2. missing-artist action in the player
3. doctor "fill tags"
