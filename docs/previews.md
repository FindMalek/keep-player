# Previews

Every pull request from this repo gets a preview, like Vercel: a build of the PR at `pr-<n>.<PREVIEW_DOMAIN>`, and one
sticky comment on the PR (edited in place, never a new one per push) with its status, an Inspect link to the Dokploy
app and the Preview link. Closing the PR deletes the app and marks the comment as deleted.

Sign in with `demo` / `demo`.

## What is isolated

- **Data:** each preview runs with an empty data directory (no volume): sessions, listening history, the search index
  and the cover cache start from nothing. Production data is never copied.
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
