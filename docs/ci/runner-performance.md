# Making the self-hosted runner fast

Blacksmith and other premium runners win on three things: **bare-metal cores**, **fast NVMe storage**, and **aggressive caching**. A homelab runner can match or beat them if you optimize the same three axes.

## 1. Hardware: give the runner real resources

- **CPU**: 8+ physical cores. CI is embarrassingly parallel (lint + typecheck + build + test).
- **RAM**: 32 GB minimum, 64 GB if you run Docker builds + Next.js + Playwright together.
- **Disk**: NVMe SSD for the runner work dir. A SATA SSD is fine for light repos; a spinning disk will bottleneck every install.
- **Network**: wired 1 Gbps+. The runner downloads images, pnpm stores, and npm tarballs.

## 2. Put the work directory on the fastest disk

```bash
sudo mkdir -p /fast/actions-runner
sudo chown $USER: /fast/actions-runner
# Configure each runner with --work /fast/actions-runner/_work
```

## 3. Pre-install toolchains instead of downloading every job

Use a pre-baked runner image or install once:

```bash
# Node
fnm install 22 && fnm install 24

# pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh -

# Bun
curl -fsSL https://bun.sh/install | bash -s 'bun-v1.4.2'

# Python
pyenv install 3.13

# Docker buildx
docker buildx create --use --name ci --driver docker-container
```

Then pin versions in workflows so the setup actions become no-ops after the first run.

## 4. Aggressive caching

### pnpm / npm / bun
Put the global store on a persistent, fast volume and share it across jobs:

```bash
mkdir -p /fast/cache/pnpm /fast/cache/npm /fast/cache/bun
echo 'store-dir=/fast/cache/pnpm' >> ~/.pnpmrc
```

### Docker layer cache
`type=gha` still works with self-hosted runners, but it uploads/downloads cache to GitHub. Use a **local cache** or a **registry cache** instead:

```yaml
cache-from: type=registry,ref=ghcr.io/findmalek/keep-player:cache
cache-to: type=registry,ref=ghcr.io/findmalek/keep-player:cache,mode=max
```

For lyterion, use per-app cache tags:

```yaml
cache-from: type=registry,ref=ghcr.io/findmalek/lyterion-api:cache
cache-to: type=registry,ref=ghcr.io/findmalek/lyterion-api:cache,mode=max
```

### Turborepo remote cache
You already use this in lyterion, sonaraem, and website. Make sure the runner can reach `vars.TURBO_API` and the token is valid. Remote cache turns no-op builds into seconds.

### Git checkout cache
Use `actions/cache` for `.git` objects if repos are large:

```yaml
- uses: actions/cache@v4
  with:
    path: .git
    key: git-${{ github.ref }}-${{ github.sha }}
    restore-keys: git-${{ github.ref }}-
```

## 5. Run jobs in ephemeral containers (optional but clean)

A single long-lived runner accumulates state. For speed *and* isolation, run each job in a Docker container:

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  -v /fast/cache:/cache \
  -e RUNNER_TOKEN=$TOKEN \
  my-ci-runner-image
```

## 6. Compile caches

- **Rust / C / C++ / Go**: use `sccache` or `ccache` backed by `/fast/cache/sccache`.
- **TypeScript**: `incremental: true` and a shared `.tsbuildinfo` cache.
- **Next.js**: keep `.next/cache` across builds.

## 7. Parallelism and job splitting

- Split `check`, `build`, `test`, `e2e` into separate jobs so they run concurrently on the same runner (or on multiple runners).
- For big test suites, shard by file:

```yaml
strategy:
  matrix:
    shard: [1/4, 2/4, 3/4, 4/4]
```

## 8. Network: pull through a local registry mirror

Set up a pull-through cache for Docker Hub and GHCR on the-keep:

```bash
# /etc/docker/daemon.json
{
  "registry-mirrors": ["https://your-cache.findmalek.engineer"]
}
```

## 9. Use `tmpfs` for small, IO-heavy jobs

```yaml
- run: pnpm install
  env:
    TMPDIR: /dev/shm
```

Be careful: `/dev/shm` is usually half your RAM.

## 10. Keep the runner lean

- Prune Docker weekly: `docker system prune -af --filter "until=168h"`
- Rotate old pnpm/npm caches: `pnpm store prune`
- Restart the runner service monthly to clear leaked processes.

## Quick comparison

| optimization | typical speedup |
|---|---|
| NVMe work dir | 2-5x on install/build |
| Docker registry cache | 3-10x on image builds |
| pnpm store persistence | 2-3x on repeat installs |
| Turborepo remote cache | 5-50x on no-op builds |
| More CPU cores | linear up to build parallelism |

## Recommended first three changes

1. Move runner work dir to NVMe.
2. Switch Docker cache from `type=gha` to `type=registry`.
3. Persist pnpm/Bun/npm caches across jobs.

Do those and the homelab runner will usually be faster than `ubuntu-latest` and competitive with Blacksmith for these repos.
