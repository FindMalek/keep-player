# How to make a SaaS launch video that works

A production bible for the keep music film: what the best product videos do, why the first
version failed, and the exact storyboard, shot list, audio plan and pipeline we build from.

Sources are listed at the end. Most are marketing blogs and agency write-ups, so numbers are
directional, not gospel. Where a claim is one editor's opinion, it says so.

## 1. What the evidence says

**The default style is plain screen recording.** A frame-by-frame study of 25 SaaS feature
videos found 13 were screen recordings and 9 were lightly animated product screens: 22 of 25.
Kinetic type, live action and 2D/3D animation barely register as standalone styles. The typical
runtime across 80 videos was 1:13, narrated at about 124 words a minute, and 19% were
music-only. ([advids](https://advids.co/blog/saas-feature-release-video-styles))

**The product shows up fast.** The first product screen typically appears at 0:09, and 8 of 13
screen recordings show it by 0:10. An editor's breakdown calls ~0:14 the "trust beat": real
interface, a real name or a real metric, not stock footage or abstract animation.
([vidpros](https://vidpros.com/best-product-demo-videos))

**One job per video.** Feature lists dilute the message ("five features in one video"), and
hiding the product behind icons, a long problem intro or a logo animation is the most common
mistake. Lead with the viewer's problem or dream outcome, not an announcement.
([hound-studio](https://hound-studio.com/blog/22-best-product-launch-videos-2026-examples-formulas))

**The five-beat spine is near-universal:** hook, problem, solution, demo or proof, one call to
action. Write the hook and the CTA first, then fill the middle.
([nereo](https://www.nereo.io/blog/product-launch-video-script-examples),
[vidpros](https://vidpros.com/product-launch-video))

**Pacing.** Quick cuts early (an editor's rule of thumb: under ~3 s a shot for the first 30 s),
then ease off. A well-designed UI can hold 5 to 7 s shots, which is how Linear works. That only
holds if the UI itself is strong. Vary the rhythm so it doesn't feel like a short-form ad.
([vidpros](https://vidpros.com/best-product-demo-videos))

**Restraint wins.** Linear, Raycast, Vercel and Cursor let the real interface be the hero:
dark surfaces, real command palettes, precise motion. Interface motion sits around 150 to
350 ms for small moves and view changes. ([designmd](https://www.designmd.co/blog/linear-vs-vercel-motion),
[studio maydit](https://studiomaydit.com/blog/linear-vercel-raycast-aesthetic))
Raycast's teaser is "dark, cropped fragments of the real interface" with a glowing search bar.
([moonb](https://www.moonb.io/blog/product-launch-video))

**Screen recordings are post-produced, not just recorded.** Screen Studio's whole value is two
things: each click triggers a smooth zoom toward the click, and shaky cursor travel becomes a
steady glide with a soft ripple on click. Notion's 30 s clips are made this way, with no motion
graphics at all. ([review](https://daveswift.com/screen-studio/),
[vidpros](https://vidpros.com/best-product-demo-videos))

**Sound is supporting cast.** Tactile, restrained UI sounds (key clicks in a few variations, a
mouse click, soft whooshes) that reinforce what is on screen; music as a bed under the action;
leave deliberate silence for the reveal; keep peaks under about -3 dB.
([playbooks](https://playbooks.com/skills/yonatangross/orchestkit/music-sfx-selection))

**It must work on mute.** Most feeds autoplay silent. Short on-screen text, readable colour
coding and a visible outcome carry the story. A first caption of 4 to 7 words is the advice.
([capcut](https://www.capcut.com/create/short-form-video-hooks))

**Plan the cutdowns.** One master becomes a 30 s, 15 s and 6 s edit. Make scenes
self-contained and cut on clean breaks. ([moonb](https://www.moonb.io/blog/product-launch-video),
[hound-studio](https://hound-studio.com/blog/22-best-product-launch-videos-2026-examples-formulas))

**Authenticity beats polish for developer tools.** Cursor's launch video is an unscripted real
session, with a small mistake left in. Real data and real interaction read as trust.

## 2. Why the first version failed

| What I built | What the research says |
| --- | --- |
| A tour of 11 features | One job per video; feature lists dilute |
| Tilted floating 3D windows, glow, grain, chromatic aberration | Restraint; the real UI is the hero |
| Fake library ("Atlas cinder 268") | Real names and real data are the trust beat |
| Title cards and effects over clips | Working screen, shown early, post-produced like Screen Studio |
| Product on screen at ~0:08, but as a spectacle | Product doing its job, readable at a glance |
| Hype-reel energy | The audience is self-hosters and developers; they trust calm and precise |

Our audience runs their own server. They distrust hype. The Linear/Raycast register fits.

## 3. The idea

**One job:** *from a thought to a song.* Everything in the film is one real listening session on
one real song.

**Promise (hook):** "Spotify, for music you own."

**The session**
1. Press ⌘K, type "hal", land on the song, press enter. It plays.
2. Press `y`. The lyrics sync to the song.
3. Right-click, start radio. See the 30 songs it will play, before it plays them.

Then one proof beat (it runs on your own Navidrome, set up in two minutes) and one CTA.

We deliberately leave out stats, the carousel, mixes, the notch and offline. They are real
features. They belong in separate clips, not in the hero film.

## 4. Storyboard (40 s master, 16:9, music only)

Tempo 120 BPM: one beat is 0.5 s, one bar is 2 s. Cuts and key events land on beats.

| Time | Beat | On screen | Caption | Sound |
| --- | --- | --- | --- | --- |
| 0.0 to 3.0 | Hook | Black. Large type: "Spotify," then "for music you own." | (the type is the caption) | Music in; soft kick on the second line |
| 3.0 to 8.0 | Trust beat | The real app, full frame, home with real covers and mixes. Window eases in. Cursor glides to search. | "Your whole library. One keystroke." | Click on the search bar |
| 8.0 to 15.0 | Search to play | ⌘K, typing "hal", results appear, arrow to the song, enter. Camera pushes into the palette, then releases as the song starts | "Search. Hear it." | Key ticks per letter; soft click on enter |
| 15.0 to 22.0 | Lyrics | Press `y`. The panel opens and lines light in time. Camera moves to the panel | "Synced lyrics. One key." | Key tick on `y` |
| 22.0 to 30.0 | Radio | Right-click, start radio. The 30-song preview appears, the cursor removes a song, then plays | "Radio you can preview." | Click, soft chime when the list lands |
| 30.0 to 35.0 | Proof | Terminal types `docker compose up -d`; three green lines; the app appears | "Runs on your Navidrome. Two minutes." | Key ticks |
| 35.0 to 40.0 | CTA | Wordmark, "Free and open source", the repo URL | (one card) | Music resolves, 1.2 s tail |

Product is on screen at 3.0 s, named at 3.0 s. The trust beat lands before 0:10.

### As built (v3, 48 s)

The storyboard above became a reveal arc, authored together with the score (120 BPM, every cut on a half second).

| Time | Beat | What happens | Score |
| --- | --- | --- | --- |
| 0 to 6 | Tension | Black. "Your library." "Your server." "Your rules." land at 1.0, 2.5 and 4.0 | Drone, soft pulses on each line, riser from 3.0, heartbeat, a gap before the hit |
| 6 to 10 | Reveal | Impact on 6.0. A bloom of light, the app comes out of the dark as the camera pulls back, a highlight sweeps the glass, "keep music. Spotify, for music you own." | Impact |
| 10 to 18 | Search and play | The recorded session, slowed 4% so the search click lands on 12.0 and the song click on 16.0 | Groove enters |
| 18 to 24 | Lyrics | `y` lands on 18.0; synced lines | Lull: bass, pad, arp only |
| 24 to 32.5 | Radio | Preview opens on 26.0, two songs dropped on 27.7 and 29.5, play on 31.0, queue on 32.0 | Full groove, snare roll |
| 32.5 to 38.5 | Showcase | Four real screens in 4K, one every three beats: mixes, stats, history, songs | Peak |
| 38.5 to 42.5 | Proof | `docker compose up -d` | Breakdown, riser |
| 42.5 to 48 | Final hit | Wordmark and URL | Impact, resolve, tail |

The score is generated, and `scripts/analyze-track.ts` reads any track's tempo and beat grid, so a real
track can replace it and the cut points can be re-derived.

## 5. Visual system

- **Canvas:** `#08090a`. One faint radial lift behind the product. No grain, no chroma split, no
  glow, no 3D tilt.
- **Frame:** the recording in a 14 px rounded rectangle with a 1 px hairline border and a soft
  shadow. Margins around it so the camera has room to move.
- **Type:** IBM Plex Sans (headlines, 600) and JetBrains Mono (labels). The same two fonts as the
  product. White on near-black, tight tracking.
- **Colour:** the only colour is the album art. That is the point of designed covers.
- **Camera:** Screen Studio logic. Zoom toward the thing being acted on, hold, ease back. Max
  zoom about 1.6x so 1080p stays crisp. Moves of 350 to 700 ms with a long ease-out.
- **Cursor:** our own, driven by recorded events: a steady glide, a soft ripple on click.
- **Keycaps:** shown only when a shortcut is the point (⌘K, `y`).
- **Motion:** one easing family (ease-out for arrivals, ease-in-out for camera). No bounce.

## 6. Audio plan

- **Music:** instrumental, 120 BPM, about 45 s, clear lift into the first reveal, resolves at the
  end. Licensed for ads and social. The placeholder is generated and must be replaced.
- **SFX:** key ticks (3 variations), a soft mouse click, a single chime for the 30-song list. Each
  one sits on an on-screen event. No whooshes unless the camera is genuinely fast.
- **Mix:** music about -14 dB under SFX peaks; no clipping, peaks under -3 dB; a 1.2 s fade tail.

## 7. Pipeline

1. **Seed real data.** A showcase library with invented but believable artists, designed covers,
   synced lyrics, and 180 days of listening history (`MOCK_LIBRARY=showcase`, `DEMO_SEED=on`).
2. **Record the session once**, as a continuous 1080p/60 screencast, while logging every move,
   click and keystroke with timestamps (`session.json`).
3. **Post-produce in Remotion:** the recording in the frame, a virtual camera keyed to the logged
   events, a virtual cursor, keycaps, captions, SFX placed from the same events.
4. **Cut to the beat.** Slow or trim segments so key events land on downbeats.
5. **Review on mute, then with sound.** Check every caption can be read in its time.
6. **Export:** 16:9 master, then a 9:16 vertical crop and 15 s and 6 s cutdowns from the same
   timeline.

## 8. Checklist before publishing

- Product on screen within 4 s; named within 10 s.
- One job. If a feature does not serve it, it is not in the film.
- Real data everywhere on screen.
- Reads on mute.
- Every effect has a reason. Remove it if you cannot say what it explains.
- Cuts and key actions land on beats.
- Track and SFX are cleared for commercial use.
- Final frame holds long enough to read the URL.

## Sources

- [advids: 80 SaaS feature release videos](https://advids.co/blog/saas-feature-release-video-styles)
- [vidpros: 20 best product demo videos, an editor's breakdown](https://vidpros.com/best-product-demo-videos)
- [hound-studio: 22 best product launch videos](https://hound-studio.com/blog/22-best-product-launch-videos-2026-examples-formulas)
- [moonb: 12 launch videos sorted by format](https://www.moonb.io/blog/product-launch-video)
- [nereo: launch video script templates](https://www.nereo.io/blog/product-launch-video-script-examples)
- [vidpros: launch video examples and plan](https://vidpros.com/product-launch-video)
- [designmd: Linear vs Vercel motion](https://www.designmd.co/blog/linear-vs-vercel-motion)
- [studio maydit: the Linear, Vercel and Raycast aesthetic](https://studiomaydit.com/blog/linear-vercel-raycast-aesthetic)
- [Dave Swift: Screen Studio review](https://daveswift.com/screen-studio/)
- [playbooks: music and SFX selection](https://playbooks.com/skills/yonatangross/orchestkit/music-sfx-selection)
- [CapCut: first 3 seconds hooks](https://www.capcut.com/create/short-form-video-hooks)
