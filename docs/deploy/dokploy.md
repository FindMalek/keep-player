# Dokploy

How [player.findmalek.engineer](https://player.findmalek.engineer) runs: a Dokploy compose that pulls the image CI
publishes, redeployed by CI on every release.

## 1. The compose

In Dokploy: **Create Service → Compose**, source **Raw**, and paste:

```yaml
services:
  player:
    image: ghcr.io/findmalek/keep-player:main   # or :latest for releases only
    restart: unless-stopped
    environment:
      NAVIDROME_URL: http://navidrome:4533       # Navidrome's service name on dokploy-network
      TRUST_PROXY: "true"                         # behind Dokploy's Traefik
    volumes:
      - player-data:/data
    read_only: true
    tmpfs: [/tmp]
    networks: [dokploy-network]

volumes:
  player-data:

networks:
  dokploy-network:
    external: true
```

Then **Domains → Add domain**: your host, service `player`, port `8080`, HTTPS on. Deploy.

The GHCR package is public, so no registry login is needed. If you fork and keep yours private, add GHCR under
**Settings → Registry** with a token that has `read:packages`.

## 2. Deploy on every release

1. In the compose: **Deployments → Webhook URL**, copy it.
2. In GitHub: **Settings → Secrets and variables → Actions**
   - secret `DOKPLOY_WEBHOOK_URL`: that URL
   - variable `PLAYER_URL`: `https://player.findmalek.engineer` (optional: CI then waits until `/api/health` answers
     after each deploy, so a broken deploy turns the run red)

CI (`.github/workflows/ci.yml`) then, when the release PR is merged: checks and tests, builds the amd64 image on the
self-hosted runner, pushes `:X.Y.Z`, `:latest`, `:main` and `:sha-…`, calls the webhook (Dokploy pulls and restarts the
container), and waits for health. Plain merges to `main` only run the tests.

## 3. Releases

Merging the release PR that release-please keeps open tags `vX.Y.Z` and publishes `:X.Y.Z`, `:X.Y` and `:latest`.
It needs **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**.

## Rolling back

Point the compose at an earlier `:sha-…` tag and redeploy, or redeploy an earlier deployment from Dokploy's list.
