#!/usr/bin/env bash
set -euo pipefail

# Install a GitHub Actions self-hosted runner on the-keep plus every toolchain
# needed by FindMalek's repos. Run as the user that will own the runner service.
#
# Usage:
#   export GH_RUNNER_TOKEN=<repo registration token>
#   ./install-runner.sh FindMalek/keep-player
#
# The token is per-repo: Settings -> Actions -> Runners -> New self-hosted runner.

REPO="${1:-}"
TOKEN="${GH_RUNNER_TOKEN:-}"
USER="${SUDO_USER:-$USER}"

if [[ -z "$REPO" ]]; then
  echo "Usage: $0 <owner/repo>" >&2
  exit 1
fi

if [[ -z "$TOKEN" ]]; then
  echo "Set GH_RUNNER_TOKEN to the registration token from https://github.com/$REPO/settings/actions/runners/new" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Base system packages
# ---------------------------------------------------------------------------
echo "==> Installing system packages..."
sudo apt-get update
sudo apt-get install -y \
  curl \
  git \
  jq \
  build-essential \
  unzip \
  zip \
  ca-certificates \
  gnupg \
  lsb-release \
  software-properties-common \
  python3 \
  python3-pip \
  python3-venv \
  zsh \
  sqlite3 \
  libnss3 \
  libatk-bridge2.0-0 \
  libxss1 \
  libgtk-3-0 \
  libasound2 \
  libgbm1 \
  libdrm2 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
  echo "Docker installed. You may need to log out and back in for group changes to take effect."
else
  echo "==> Docker already installed"
fi

# Ensure buildx exists
docker buildx create --name ci --driver docker-container --use 2>/dev/null || docker buildx use ci 2>/dev/null || true

# ---------------------------------------------------------------------------
# Node 22 + 24 via fnm
# ---------------------------------------------------------------------------
if ! command -v fnm &>/dev/null; then
  echo "==> Installing fnm..."
  curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)"
fi

echo "==> Installing Node 22 and 24..."
fnm install 22
fnm install 24
fnm default 22

# ---------------------------------------------------------------------------
# pnpm
# ---------------------------------------------------------------------------
if ! command -v pnpm &>/dev/null; then
  echo "==> Installing pnpm..."
  curl -fsSL https://get.pnpm.io/install.sh | env PNPM_HOME="$HOME/.local/share/pnpm" sh -
fi

# ---------------------------------------------------------------------------
# Bun 1.4.2
# ---------------------------------------------------------------------------
if ! command -v bun &>/dev/null || [[ "$(bun --version)" != "1.4.2" ]]; then
  echo "==> Installing Bun 1.4.2..."
  curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2"
fi

# ---------------------------------------------------------------------------
# Python 3.13 via pyenv
# ---------------------------------------------------------------------------
if ! command -v pyenv &>/dev/null; then
  echo "==> Installing pyenv..."
  curl -fsSL https://pyenv.run | bash
  export PATH="$HOME/.pyenv/bin:$PATH"
  eval "$(pyenv init -)"
fi

if ! pyenv versions --bare | grep -q "^3.13"; then
  echo "==> Installing Python 3.13..."
  pyenv install 3.13
fi
pyenv global 3.13

# ---------------------------------------------------------------------------
# Playwright Chromium deps
# ---------------------------------------------------------------------------
if command -v npx &>/dev/null; then
  echo "==> Installing Playwright system deps..."
  npx playwright install-deps chromium || true
fi

# ---------------------------------------------------------------------------
# Persistent caches on fast disk
# ---------------------------------------------------------------------------
FAST_DIR="${FAST_DIR:-/fast}"
if [[ -d "$FAST_DIR" ]]; then
  echo "==> Setting up persistent caches under $FAST_DIR..."
  sudo mkdir -p "$FAST_DIR/cache/pnpm" "$FAST_DIR/cache/npm" "$FAST_DIR/cache/bun" "$FAST_DIR/cache/docker" "$FAST_DIR/cache/turbo"
  sudo chown -R "$USER:" "$FAST_DIR/cache"

  # pnpm
  echo "store-dir=$FAST_DIR/cache/pnpm" > "$HOME/.pnpmrc"
  echo "cache-dir=$FAST_DIR/cache/pnpm" >> "$HOME/.pnpmrc"

  # npm
  npm config set cache "$FAST_DIR/cache/npm" --global

  # bun
  mkdir -p "$HOME/.bun"
  echo "export BUN_INSTALL_CACHE_DIR=$FAST_DIR/cache/bun" >> "$HOME/.bashrc"

  # docker local cache dir
  mkdir -p "$FAST_DIR/cache/docker"
else
  echo "==> No $FAST_DIR found; skipping persistent cache setup. Mount an NVMe disk there and re-run."
fi

# ---------------------------------------------------------------------------
# GitHub Actions runner
# ---------------------------------------------------------------------------
RUNNER_DIR="${RUNNER_DIR:-/opt/actions-runner/$REPO}"
RUNNER_NAME="${RUNNER_NAME:-the-keep-$(echo "$REPO" | tr '/ ' '-')}""
VERSION="${RUNNER_VERSION:-2.322.0}"
ARCH="$(uname -m)"
ARCH="${ARCH/aarch64/arm64}"
ARCH="${ARCH/x86_64/amd64}"

echo "==> Installing runner for $REPO to $RUNNER_DIR..."
sudo mkdir -p "$RUNNER_DIR"
sudo chown "$USER:" "$RUNNER_DIR"
cd "$RUNNER_DIR"

if [[ ! -f actions-runner-linux-$ARCH-$VERSION.tar.gz ]]; then
  curl -fsSL -o actions-runner-linux-$ARCH-$VERSION.tar.gz \
    "https://github.com/actions/runner/releases/download/v$VERSION/actions-runner-linux-$ARCH-$VERSION.tar.gz"
fi

tar xzf actions-runner-linux-$ARCH-$VERSION.tar.gz
rm -f actions-runner-linux-$ARCH-$VERSION.tar.gz

# Persist tool paths for runner jobs
mkdir -p .env
cat > .env/runner <<EOF
export PATH="$HOME/.local/share/fnm:$HOME/.local/share/pnpm:$HOME/.bun/bin:$HOME/.pyenv/bin:$HOME/.pyenv/shims:\$PATH"
eval "\$(fnm env --use-on-cd)"
eval "\$(pyenv init -)"
EOF

./config.sh \
  --url "https://github.com/$REPO" \
  --token "$TOKEN" \
  --name "$RUNNER_NAME" \
  --labels "self-hosted,the-keep" \
  --unattended \
  --replace \
  --work "$RUNNER_DIR/_work"

sudo ./svc.sh install "$USER"
sudo ./svc.sh start

echo "==> Runner installed and started for $REPO"
echo "Check status: sudo systemctl status actions.runner.$REPO.$(hostname).service"
