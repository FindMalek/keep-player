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
| `bun run check` | everything except e2e |

## UI components

The UI is shadcn/ui on Base UI (style `base-lyra`) plus the [audiocn](https://audiocn.dev) registry. Never hand-roll
something the registries have:

```sh
bunx shadcn add tooltip            # shadcn component -> src/web/components/ui/
bunx shadcn add @audiocn/waveform  # audiocn component, hooks -> src/web/hooks/, helpers -> src/web/lib/audio/
```

Those three folders are vendored: Biome skips them, and changes there should be small and on purpose (re-adding a
component overwrites them). App code composes them in `src/web/components/`. Icons are `lucide-react` (the shadcn default). Tailwind v4 runs through
`bun-plugin-tailwind` (`bunfig.toml` for dev, `scripts/build.ts` for the production executable).

## Rules

- One issue, one PR. Branch with `gh issue develop <n> --checkout`, PR body says `Closes #<n>`.
- Commits: `type(scope): subject`, subject ≤ 5 words, lowercase, imperative (`fix(lyrics): offset drift`).
- Tests: one focused test per behavior or bug. Pure logic gets a unit test; flows and shortcuts get an e2e test.
  Mock only the network (the mock Subsonic server), never our own modules.
- The mock server lives in `test/mock/`. When the app calls a new Subsonic endpoint, add it there in the same PR.

## Deploys

Every push to `main` builds `ghcr.io/findmalek/keep-player:main` and, when the `DOKPLOY_WEBHOOK_URL` secret is set,
calls the Dokploy compose webhook so the server pulls the new image.
