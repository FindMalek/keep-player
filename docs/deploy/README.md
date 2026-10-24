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
| `latest`, `0.4`, `0.4.1` | releases |
| `main` | the latest release, same as `latest` (what the author runs) |
| `sha-abc1234` | one exact commit |

## Health

- `/healthz`: the process answers (the image's Docker healthcheck).
- `/api/health`: readiness. `200` when every configured Navidrome answers, `503` otherwise, with each server's
  id, latency and version. It never shows server addresses, so it's safe to expose.

## Reverse proxies

Audio is streamed with HTTP Range requests and can run for many minutes: don't buffer it and don't cut long
responses.

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
  proxy_buffering off;       # stream audio as it arrives
  proxy_read_timeout 1h;     # long tracks
}
```

Set `TRUST_PROXY=true` behind any of them, so login rate limits see the real client address.
