# Previews

Every pull request from this repo gets one, like Vercel: a build of the PR's player at `player-pr-<n>.<PREVIEW_DOMAIN>`
(its API reference at `/api`), and one sticky comment on the PR (edited in place, never a new one per push): building as
soon as the PR opens, deploying, ready or failed, with the build log, the Dokploy deploy log and, once it's up, the
Preview link. Closing the PR deletes the app and marks the comment as deleted. The site (`apps/web`) is hosted on Vercel,
which previews it on every PR with a comment of its own.

Sign in with `demo` / `demo`.

## In the macOS app

Sign out, tap the sign-in page's background 4 times, and enter the id from the PR comment (`pr-123`, `123` or the full
address). The app opens that preview for this launch, with the id in the window title; keep music → **Leave Preview**
(or 4 taps again → "Back to …") returns to your server. Previews are at `player-pr-<n>.preview.findmalek.engineer`;
point the app elsewhere with `defaults write engineer.findmalek.keep-music previewDomain preview.example.com`.

## What is isolated

- **Data:** each preview runs with an empty data directory (no volume): sessions, the search index and the cover cache
  start from nothing. Production data is never copied. The one thing put in is generated: with `DEMO_SEED=on` the
  server fills the demo account's history with about six months of believable listening (a few favourites, a long tail,
  evenings and weekends, some skips), so Stats and History aren't empty. It is the same every time.
- **Library:** every preview talks to one shared demo Navidrome. Its library is the [generated demo
  library](demo-library.md) baked into an image, so it is the same for every preview and contains no real music.
- **Network:** both hosts sit behind the tailnet-only middleware, like the other `*.findmalek.engineer` services.
  Starring or creating a playlist in one preview shows up in the others (same demo account); that's the one thing shared.

## Setup (once)

Previews stay off until the repo variable `DEPLOY_ENABLED` is `true`.

| kind | name | what |
|---|---|---|
| variable | `DEPLOY_ENABLED` | `true` turns previews and the demo deploy on |
| variable | `DOKPLOY_PUBLIC_URL` | Dokploy's URL, reachable from GitHub runners |
| variable | `PREVIEW_DOMAIN` | e.g. `preview.findmalek.engineer`; needs a wildcard DNS record to the tailnet IP |
| secret | `DOKPLOY_API_KEY` | a Dokploy API key |
| secret | `GHCR_READ_TOKEN` | optional classic PAT with `read:packages`, so Dokploy can keep pulling images after the job ends |

Then run the **Demo** workflow once (Actions → Demo → Run workflow). It builds `ghcr.io/findmalek/keep-player-demo`,
deploys it as `keep-player-demo` at `demo.<PREVIEW_DOMAIN>` and creates the `demo` account. It runs again on its own
whenever the generator changes.

Pull requests from forks get no preview: they have no access to the secrets.

## Trying the pieces locally

`bun run demo:library ./demo-music` and `docker compose -f compose.demo.yaml up` give the same library on your machine
(see [demo-library](demo-library.md)).
