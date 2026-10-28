# Self-hosted GitHub Actions runner on the-keep

GitHub-hosted runner minutes are exhausted, so CI jobs run on the-keep itself. GitHub still schedules workflows and stores logs; the runner executes the jobs.

## Hardware / OS assumptions

- The-keep is running Ubuntu/Debian ARM64 (or AMD64 — adjust the download URL).
- The runner user is in the `docker` group for image builds.
- Tools are installed once on the runner instead of fetched per job:
  - Node 22 and 24
  - pnpm (latest v9+) and npm
  - Bun 1.4.2 (for lodesong / keep-dashboard)
  - Python 3.13 (for keep-minecraft datapack build)
  - Docker + buildx (for image builds and pushes)
  - Playwright Chromium deps (`npx playwright install-deps chromium`, for lodesong e2e)
  - zsh and bash (for guesswork shell tests)

## Install one runner per repo

```bash
REPO=FindMalek/lodesong   # or keep-dashboard, keep-minecraft
RUNNER_USER=findmalek
VERSION=2.322.0
ARCH=arm64                   # or amd64

sudo mkdir -p /opt/actions-runner/$REPO
sudo chown $RUNNER_USER: /opt/actions-runner/$REPO
cd /opt/actions-runner/$REPO

curl -fsSL -o runner.tar.gz \
  https://github.com/actions/runner/releases/download/v$VERSION/actions-runner-linux-$ARCH-$VERSION.tar.gz
tar xzf runner.tar.gz
rm runner.tar.gz

# Get a registration token from:
# https://github.com/$REPO/settings/actions/runners/new
./config.sh \
  --url https://github.com/$REPO \
  --token <TOKEN> \
  --labels the-keep \
  --unattended \
  --name the-keep-$REPO

sudo ./svc.sh install $RUNNER_USER
sudo ./svc.sh start
```

Repeat for `FindMalek/keep-dashboard` and `FindMalek/keep-minecraft`.

## Maintenance

- Update the runner when GitHub warns it is deprecated:
  ```bash
  cd /opt/actions-runner/$REPO
  ./svc.sh stop
  ./config.sh remove --token <TOKEN>
  # re-install latest version as above
  ```
- Clean Docker build cache weekly to stop `/var/lib/docker` from growing:
  ```bash
  docker system prune -f --filter "until=168h"
  ```

## Security

- The runner has write access to the docker socket. Do not run untrusted workflows.
- Keep repository secrets scoped to the environments that need them (`production` for deploy).
- Runner logs and job files live in `/opt/actions-runner/$REPO/_diag` and `_work`.
