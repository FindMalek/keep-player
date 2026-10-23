#!/usr/bin/env bash
# Run this on the-keep as a sudo-capable user.
# It mounts an NVMe disk at /fast, installs runners for every migrated repo,
# and triggers a test workflow so you can verify the dashboard panel works.
set -euo pipefail

TOKEN="${GH_RUNNER_TOKEN:-}"
GH_TOKEN="${GH_TOKEN:-}"
if [[ -z "$TOKEN" && -z "$GH_TOKEN" ]]; then
  echo "Set GH_RUNNER_TOKEN to a repo-scoped GitHub PAT, or set GH_TOKEN and this script will generate per-repo registration tokens." >&2
  echo "Generate one at https://github.com/settings/tokens" >&2
  exit 1
fi

get_registration_token() {
  local repo=$1
  if [[ -n "$TOKEN" ]]; then
    echo "$TOKEN"
    return
  fi
  curl -fsSL -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/$repo/actions/runners/registration-token" | jq -r '.token'
}

USER="${SUDO_USER:-$USER}"
RUNNER_VERSION="${RUNNER_VERSION:-2.322.0}"
REPOS=(
  FindMalek/keep-player
  FindMalek/keep-dashboard
  FindMalek/lyterion
  FindMalek/website
  FindMalek/sonaraem
  FindMalek/guesswork
  FindMalek/dukkani
  FindMalek/ceraghit
  FindMalek/noch
  FindMalek/t-saif
  FindMalek/raqib
  FindMalek/one-ring
  FindMalek/keep-minecraft
)

# ---------------------------------------------------------------------------
# 1. Ensure /fast is an NVMe mount
# ---------------------------------------------------------------------------
setup_fast() {
  if mountpoint -q /fast 2>/dev/null; then
    echo "==> /fast is already mounted"
    return
  fi

  echo "==> Looking for an unmounted NVMe disk..."
  NVME=$(lsblk -dn -o NAME,SIZE,TYPE,MODEL | grep -i nvme | awk '{print "/dev/" $1}' | head -n1 || true)

  if [[ -z "$NVME" ]]; then
    echo "WARNING: no NVMe disk found. Using /srv/fast on the data disk." >&2
    sudo mkdir -p /srv/fast
    sudo ln -sf /srv/fast /fast 2>/dev/null || true
  else
    echo "==> Found $NVME"
    if ! lsblk -f "$NVME" | grep -q ext4; then
      echo "==> Formatting $NVME as ext4 (this destroys all data on it)"
      read -p "Continue? [y/N] " confirm
      [[ "$confirm" == [yY]* ]] || exit 1
      sudo mkfs.ext4 -L fastcache "$NVME"
    fi
    sudo mkdir -p /fast
    if ! grep -q "^LABEL=fastcache " /etc/fstab; then
      echo 'LABEL=fastcache /fast ext4 defaults,noatime,nofail 0 2' | sudo tee -a /etc/fstab
    fi
    sudo mount -a
  fi

  sudo mkdir -p /fast/cache/pnpm /fast/cache/npm /fast/cache/bun /fast/cache/docker /fast/cache/turbo
  sudo chown -R "$USER:" /fast
  echo "==> /fast ready"
}

# ---------------------------------------------------------------------------
# 2. Install base toolchains once
# ---------------------------------------------------------------------------
install_tools() {
  echo "==> Updating packages..."
  sudo apt-get update
  sudo apt-get install -y curl git jq build-essential unzip zip ca-certificates \
    gnupg lsb-release software-properties-common python3 python3-pip python3-venv \
    zsh sqlite3 libnss3 libatk-bridge2.0-0 libxss1 libgtk-3-0 libasound2t64 libgbm1 \
    libdrm2 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libbz2-dev libncurses-dev libffi-dev libssl-dev libreadline-dev zlib1g-dev libsqlite3-dev

  # Docker
  if ! command -v docker &>/dev/null; then
    echo "==> Installing Docker..."
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker "$USER"
  fi

  docker buildx create --name ci --driver docker-container --use 2>/dev/null || docker buildx use ci 2>/dev/null || true

  # fnm + Node
  if ! command -v fnm &>/dev/null; then
    curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell
  fi
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)"
  fnm install 22
  fnm install 24
  fnm default 22

  # pnpm
  if ! command -v pnpm &>/dev/null; then
    curl -fsSL https://get.pnpm.io/install.sh | env PNPM_HOME="$HOME/.local/share/pnpm" sh -
  fi

  # Bun
  if ! command -v bun &>/dev/null || [[ "$(bun --version)" != "1.4.2" ]]; then
    curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2"
  fi

  # Python 3.13
  if ! command -v pyenv &>/dev/null; then
    curl -fsSL https://pyenv.run | bash
  fi
  export PATH="$HOME/.pyenv/bin:$PATH"
  eval "$(pyenv init -)"
  if ! pyenv versions --bare | grep -q "^3.13"; then
    pyenv install 3.13
  fi
  pyenv global 3.13

  # Playwright deps
  if command -v npx &>/dev/null; then
    npx playwright install-deps chromium || true
  fi

  # Caches
  echo "store-dir=/fast/cache/pnpm" > "$HOME/.pnpmrc"
  echo "cache-dir=/fast/cache/pnpm" >> "$HOME/.pnpmrc"
  npm config set cache /fast/cache/npm --global
  echo "export BUN_INSTALL_CACHE_DIR=/fast/cache/bun" >> "$HOME/.bashrc"
}

# ---------------------------------------------------------------------------
# 3. Install a runner for each repo
# ---------------------------------------------------------------------------
install_runners() {
  ARCH="$(uname -m)"
  ARCH="${ARCH/aarch64/arm64}"
  ARCH="${ARCH/x86_64/amd64}"

  for REPO in "${REPOS[@]}"; do
    echo "==> Installing runner for $REPO..."
    RUNNER_DIR="/opt/actions-runner/$REPO"
    RUNNER_NAME="the-keep-$(echo "$REPO" | tr '/ ' '-')"
    sudo mkdir -p "$RUNNER_DIR"
    sudo chown "$USER:" "$RUNNER_DIR"
    cd "$RUNNER_DIR"

    if [[ ! -f config.sh ]]; then
      curl -fsSL -o runner.tar.gz \
        "https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-$ARCH-$RUNNER_VERSION.tar.gz"
      tar xzf runner.tar.gz
      rm -f runner.tar.gz
    fi

    cat > .env/runner <<EOF
export PATH="$HOME/.local/share/fnm:$HOME/.local/share/pnpm:$HOME/.bun/bin:$HOME/.pyenv/bin:$HOME/.pyenv/shims:\$PATH"
eval "\$(fnm env --use-on-cd)"
eval "\$(pyenv init -)"
EOF

    REPO_TOKEN=$(get_registration_token "$REPO")
    ./config.sh \
      --url "https://github.com/$REPO" \
      --token "$REPO_TOKEN" \
      --name "$RUNNER_NAME" \
      --labels "self-hosted,the-keep" \
      --unattended \
      --replace \
      --work "$RUNNER_DIR/_work" || true

    sudo ./svc.sh install "$USER" || true
    sudo ./svc.sh start || true
  done
}

# ---------------------------------------------------------------------------
# 4. Trigger a test workflow on keep-dashboard to verify
# ---------------------------------------------------------------------------
trigger_test() {
  echo "==> Triggering test workflow on keep-dashboard..."
  local auth_token="${GH_TOKEN:-$TOKEN}"
  curl -fsSL -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $auth_token" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    https://api.github.com/repos/FindMalek/keep-dashboard/actions/workflows/ci.yml/dispatches \
    -d '{"ref":"main"}' || echo "Could not trigger test workflow. If CI is disabled due to usage, it will queue once usage resets or a self-hosted runner is online."
}

# ---------------------------------------------------------------------------
main() {
  setup_fast
  install_tools
  install_runners
  trigger_test
  echo "==> Done. Runners should appear online in a minute."
  echo "==> Check one: sudo systemctl status actions.runner.FindMalek-keep-dashboard.$(hostname).service"
}

main
