# Mobile app

Notes for [#319](https://github.com/FindMalek/lodesong/issues/319). Not planned yet; this keeps the options written down
for when the desktop apps ([#309](https://github.com/FindMalek/lodesong/issues/309)) have settled.

## Today

Phones use any Subsonic app (Arpeggi) against Navidrome, and the queue hands off through `savePlayQueue` /
`getPlayQueue`. The player is also an installable PWA ([settings and PWA](../self-hosting.md)).

## What a lodesong mobile app would add over that

- mixes, lyrics sync, recap and listen together on the phone, not only playback
- background audio and lock screen controls that a PWA gets unreliably (iOS especially)
- offline downloads

## Options

| option | cost | catch |
|---|---|---|
| keep the PWA, improve it | lowest | iOS background audio and storage limits |
| Capacitor around the player | small: reuses the whole page | store review, still a webview audio stack |
| native (Swift / Kotlin) or React Native | highest | rewrites the player and lyrics views |

Recommendation when revisited: Capacitor with a native audio plugin for background playback and lock screen controls,
sharing `apps/player` and the same `native.ts` bridge as the desktop shells.

## Before starting

- decide offline scope (it drives storage and sync design)
- test iOS WebKit audio with the screen locked on the current PWA to see what is actually broken
