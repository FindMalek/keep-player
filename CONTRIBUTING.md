# Contributing

## Setup

```sh
bun install
bunx playwright install chromium
bun run mock                                   # fake Navidrome on :4599, login demo / demo, 10k tracks
NAVIDROME_URL=http://127.0.0.1:4599 bun run dev  # app on :8080
```

## Checks

CI runs the same steps on every PR, and `main` only takes green PRs.

| command | what |
|---|---|
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` / `bun run format` | Biome lint + format (`format` fixes) |
| `bun run test` | unit tests (`*.test.ts` next to the code) |
| `bun run e2e` | Playwright against the mock server (`e2e/*.e2e.ts`) |
| `bun run size` | production bundle vs the gzip budget in `scripts/bundle-size.ts` |
| `bun run config-docs` | regenerate `docs/configuration.md` after changing `apps/server/src/settings.ts` |
| `bun run shortcuts-docs` | regenerate `docs/shortcuts.md` after changing `apps/player/src/app-shortcuts.ts` |
| `bun run screenshots` | refresh the README screenshots from a running instance (`SCREENSHOT_URL`, `_USER`, `_PASSWORD`) |
| `bun run check` | everything except e2e |

## UI components

The UI is shadcn/ui on Base UI (style `base-lyra`) plus the [audiocn](https://audiocn.dev) registry. Never hand-roll
something the registries have:

```sh
bunx shadcn add tooltip            # shadcn component -> apps/player/src/components/ui/
bunx shadcn add @audiocn/waveform  # audiocn component, hooks -> apps/player/src/hooks/, helpers -> apps/player/src/lib/audio/
```

Those three folders are vendored: Biome skips them, and changes there should be small and on purpose (re-adding a
component overwrites them). Current local edits, to redo after re-adding: `slider.tsx` thumb uses `bg-background`;
`sidebar.tsx` imports its mobile sheet from `components/lazy-sheet.tsx` (keeps a dialog out of the first screen);
`command.tsx` keeps the dialog's screen-reader title inside `DialogContent` (outside, it sits outside every landmark);
`audio-player.tsx` always takes our engine as `player` (its internal `<audio>` fallback and `useAudioPlayer` are dropped,
which keeps that hook off the first screen); `sidebar.tsx` gets its tooltip components from `lib/tooltips.ts` (loaded
after the first screen) and only wraps buttons in a tooltip trigger while collapsed. `context-menu.tsx` was written from `dropdown-menu.tsx`
on Base UI's ContextMenu (the registry was unreachable when it was added); replace it with `bunx shadcn add context-menu`. App code composes them in `apps/player/src/components/`. Icons are `lucide-react` (the shadcn default). Tailwind v4 runs through
`bun-plugin-tailwind` (`bunfig.toml` for dev, `scripts/build.ts` for the production executable).

## Rules

- One issue, one PR. Branch with `gh issue develop <n> --checkout`, PR body says `Closes #<n>`.
- Commits: `type(scope): subject`, subject ≤ 5 words, lowercase, imperative (`fix(lyrics): offset drift`).
- Tests: one focused test per behavior or bug. Pure logic gets a unit test; flows and shortcuts get an e2e test.
  Mock only the network (the mock Subsonic server), never our own modules.
- The mock server lives in `test/mock/`. When the app calls a new Subsonic endpoint, add it there in the same PR.

## How it ships

`bun run build` bundles the web app into `dist/web` (minified, code-split, hashed names), precompresses every file
(brotli + gzip), and compiles the server with those files embedded into one executable, `dist/keep-player`. In
production the server serves them itself: hashed assets `immutable`, `index.html` `no-cache` with the CSP header. In
development (`bun run dev`) Bun bundles on the fly with hot reload instead. e2e tests always run the executable.

A service worker (`apps/player/src/sw.ts`, built to `/sw.js`) keeps the app shell for offline, serves covers cache-first, and
downloads the next three songs into an LRU audio cache it serves Range requests from (`lib/offline.ts` is the page
side). Albums and playlists can be kept offline (pinned, never evicted).

Pages are separate chunks (`apps/player/src/routes.tsx`), preloaded when a link is hovered or focused and all fetched once the
browser is idle. The first screen is budgeted (`bun run size`) and the home page must score ≥ 93 on Lighthouse
(`e2e/lighthouse.e2e.ts`).

## Deploys

Every push to `main` builds `ghcr.io/findmalek/keep-player:main` (amd64 + arm64, with SBOM and provenance) and, when
the `DOKPLOY_WEBHOOK_URL` secret is set, calls the Dokploy compose webhook so the server pulls the new image, then
waits for `$PLAYER_URL/api/health`. Pull requests build the image too and smoke-test it read-only. release-please
keeps a release PR open; merging it publishes `:X.Y.Z` and `:latest`. Setup: [docs/deploy/dokploy.md](docs/deploy/dokploy.md).

New settings go in `apps/server/src/settings.ts` (parsed and checked at boot), then `bun run config-docs`.
