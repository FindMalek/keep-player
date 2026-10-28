# Roadmap

The plan for making lodesong the best self-hosted music player. Every item is a GitHub issue; epics hold
sub-issues. Run [`scripts/setup-project.sh`](../scripts/setup-project.sh) once to put them all on a GitHub Project
board with a `Phase` and `Priority` field.

**Where it stands:** the [1.0 milestone](https://github.com/FindMalek/lodesong/milestone/1) is done (mixes, uploads,
Lyterion, previews). [2.0](https://github.com/FindMalek/lodesong/milestone/2) is under way: one session across
devices, now playing in the terminal, the recap reel and prompt playlists are in; a macOS app, AudioMuse and more are
next.

## Principles

- **shadcn ecosystem only.** UI is shadcn/ui (Base UI) + Tailwind v4 + the [`@audiocn`](https://github.com/audiocn/ui)
  registry. No hand-rolled components where one exists, no Tailwind palette colors. The brand (monochrome, square,
  IBM Plex + JetBrains Mono, color only for errors) lives only in the shadcn theme tokens.
- **Instant.** Persisted cache, prefetch on intent, virtualized lists, selector-based player state, precached audio.
- **Keyboard first, never memorized.** One shortcut registry drives the shortcuts, the `?` cheat sheet, the command
  palette and every tooltip.
- **Navidrome is the source of truth.** Sync with Arpeggi and other clients uses standard (Open)Subsonic APIs only.
- **Self-hostable by anyone.** One container, one env var to start, guided onboarding, safe defaults.

## Epics

| # | epic | priority |
|---|---|---|
| [#1](https://github.com/FindMalek/lodesong/issues/1) | Foundation: shadcn + Tailwind v4 + audiocn | p0 |
| [#2](https://github.com/FindMalek/lodesong/issues/2) | Performance | p0 |
| [#3](https://github.com/FindMalek/lodesong/issues/3) | Playback engine: gapless, precaching, crossfade | p0 |
| [#4](https://github.com/FindMalek/lodesong/issues/4) | Keyboard-first | p0 |
| [#30](https://github.com/FindMalek/lodesong/issues/30) | Search: fuzzy, typo-tolerant, lyrics | p0 |
| [#5](https://github.com/FindMalek/lodesong/issues/5) | Lyrics everywhere | p0 |
| [#6](https://github.com/FindMalek/lodesong/issues/6) | UX polish: loading, tooltips, motion, states | p1 |
| [#7](https://github.com/FindMalek/lodesong/issues/7) | Cross-device sync with Arpeggi | p1 |
| [#8](https://github.com/FindMalek/lodesong/issues/8) | Library & playlists | p1 |
| [#9](https://github.com/FindMalek/lodesong/issues/9) | Self-hosting: onboarding, security, docs | p1 |
| [#60](https://github.com/FindMalek/lodesong/issues/60) | Signature features other players miss | p1 |
| [#10](https://github.com/FindMalek/lodesong/issues/10) | Discovery, AI playlists & aura | p2 |

## Build order

Phases are ordered by dependency, not just importance: later work assumes the earlier foundations.

1. **Foundation & speed**: the shadcn rebuild, tooling, player store, virtualization, data layer, covers, sessions
   (credential-free URLs make covers and audio cacheable).
   #11 #12 #13 #14 #15 #16 #17 #18 #19 #20 #54
2. **Playback & keyboard**: gapless, precache, resilience, the queue model, the shortcut registry and cheat sheet,
   list navigation, a11y.
   #21 #22 #25 #47 #26 #27 #28 #29
3. **Lyrics & search**: lyrics service and UI, the server index, lyrics search, search UX.
   #34 #35 #31 #32 #33
4. **Polish & sync**: tooltips, skeletons, motion, states, now-playing views, queue hand-off, likes, history,
   context menus, playlist editing.
   #37 #38 #39 #40 #41 #42 #43 #44 #45 #46
5. **v1.0 public release**: onboarding, distribution, docs, settings/PWA, lyrics coverage, Spotify import, library
   browsing.
   #50 #51 #52 #53 #36 #48 #49
6. **Beyond**: crossfade, audio quality, radio, AudioMuse, Groq mixes, aura, stats, moments, trims, undo, library
   doctor, listen together.
   #23 #24 #55 #56 #57 #58 #59 #61 #62 #63 #64 #65

## Decisions

| topic | decision |
|---|---|
| aura | strictly monochrome generated textures from audio features; no cover-derived color |
| lyrics files | cached in the app by default; writing `.lrc` sidecars is opt-in (`LYRICS_WRITE_LRC`) |
| Arpeggi sync | `savePlayQueue`/`getPlayQueue` (Arpeggi lists "sync queue across devices"), stars, ratings, playlists |
| crossfade / EQ | gapless always on; crossfade and EQ optional, off by default; no crossfade within an album |
| lyrics search | needs an index: the Bun server keeps SQLite FTS5 (words + trigram) over library and lyrics |
| upstream server | fixed by server config (`NAVIDROME_URL` / allowlist), never chosen by the browser |
| credentials | server-side sessions with an httpOnly cookie; no tokens in browser storage or URLs |
