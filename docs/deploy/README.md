# Deploying

keep music is one container (`ghcr.io/findmalek/keep-player`, amd64) that needs to reach your Navidrome.
It keeps its state in one volume at `/data`, runs as an unprivileged user and works with a read-only root filesystem.

| file | setup |
|---|---|
| [`../../compose.yaml`](../../compose.yaml) | next to an existing Navidrome (join its Docker network) |
| [`full-stack.compose.yaml`](full-stack.compose.yaml) | Navidrome and keep music together, from scratch |
| [`traefik.compose.yaml`](traefik.compose.yaml) | behind Traefik with a domain and TLS |
| [`dokploy.md`](dokploy.md) | Dokploy, with automatic deploys from CI |

Every setting is an environment variable: [configuration](../configuration.md). Usually only `NAVIDROME_URL`.

## Image tags

| tag | what |
|---|---|
| `latest`, `1.2`, `1.2.0` | releases |
| `main` | the latest release, same as `latest` (what the author runs) |
| `sha-abc1234` | one exact commit |

## Health

- `/healthz`: the process answers (the image's Docker healthcheck).
- `/api/health`: readiness. `200` when every configured Navidrome answers, `503` otherwise, with each server's
  id, latency and version. It never shows server addresses, so it's safe to expose.

## Reverse proxies

Audio is streamed with HTTP Range requests and can run for many minutes: don't buffer it and don't cut long
responses. The device picker and listen together use WebSockets (`/api/devices`, `/api/listen/*`): let upgrades
through.

**Caddy**

```caddy
music.example.com {
  reverse_proxy player:8080
}
```

**nginx**

```nginx
location / {
  proxy_pass http://player:8080;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_http_version 1.1;    # WebSockets (devices, listen together)
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_buffering off;       # stream audio as it arrives
  proxy_read_timeout 1h;     # long tracks
}
```

Set `TRUST_PROXY=true` behind any of them, so login rate limits see the real client address.
