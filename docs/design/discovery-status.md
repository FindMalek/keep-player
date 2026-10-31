# Discovery epic: status

Tracking for [#10](https://github.com/FindMalek/lodesong/issues/10).

| stage | what | state |
|---|---|---|
| 1 | radio and stats from Navidrome data (`getSimilarSongs2`, `getTopSongs`, scrobbles) | shipped ([radio](../mixes.md), stats, recap) |
| 2 | AudioMuse-AI: similarity, smart shuffle, energy/mood/BPM features | [#56](https://github.com/FindMalek/lodesong/issues/56), in review |
| 3 | Groq: mood names, playlists from a prompt, daily / weekly mixes | shipped ([mixes](../mixes.md)) |
| 4 | aura: monochrome generated visuals per playlist | shipped for playlists and lyrics; audio-feature driven parameters wait on stage 2 |

## Left once stage 2 lands

- aura density, softness and drift speed from energy, valence and BPM
- day-parted and mood mixes using audio features rather than artist moods only
- Sonaraem-style clustering over the feature space (see [mixes](../mixes.md#made-for-you-home))

When #56 is merged, aura parameters are the last item; the epic can close after that.
