#!/bin/sh
# Copy the source to your server and redeploy the Dokploy compose that builds it, then wait for health.
# Settings come from .deploy.env (git-ignored): KEEP_HOST (ssh host), COMPOSE_ID (Dokploy), SOURCE_DIR
# (a path Dokploy can see, e.g. /etc/dokploy/sources/keep-player). The server needs the `dk` helper
# from host/ (Dokploy API with your key).
set -eu
cd "$(dirname "$0")"
[ -f .deploy.env ] && . ./.deploy.env
: "${KEEP_HOST:?set KEEP_HOST in .deploy.env}" "${COMPOSE_ID:?set COMPOSE_ID}" "${SOURCE_DIR:?set SOURCE_DIR}"
SERVICE=${SERVICE:-player}

bunx tsc --noEmit
tar --no-xattrs -czf - --exclude node_modules --exclude .DS_Store --exclude .git --exclude .deploy.env --exclude docs . \
  | ssh "$KEEP_HOST" "sudo rm -rf $SOURCE_DIR.new && sudo mkdir -p $SOURCE_DIR.new && sudo tar -xzf - -C $SOURCE_DIR.new && sudo rm -rf $SOURCE_DIR && sudo mv $SOURCE_DIR.new $SOURCE_DIR"

# Wait on Dokploy's deployment record: when nothing changed, compose keeps the old container.
ssh "$KEEP_HOST" "sudo python3 - $COMPOSE_ID $SERVICE" <<'PY'
import json, subprocess, sys, time
compose_id, service = sys.argv[1], sys.argv[2]
dk = lambda *args: subprocess.run(["dk", *args], capture_output=True, text=True, check=True).stdout
latest = lambda: max(json.loads(dk("GET", f"deployment.allByCompose?composeId={compose_id}")), key=lambda d: d["createdAt"], default=None)
before = (latest() or {}).get("deploymentId")
dk("POST", "compose.deploy", json.dumps({"composeId": compose_id}))
for _ in range(100):
    time.sleep(3)
    deployment = latest()
    if not deployment or deployment["deploymentId"] == before or deployment["status"] == "running":
        continue
    if deployment["status"] != "done":
        sys.exit(f"deploy {deployment['status']}: {deployment.get('errorMessage') or 'see dokploy logs'}")
    for _ in range(30):
        health = subprocess.run(
            f"docker inspect -f '{{{{.State.Health.Status}}}}' $(docker ps -qf label=com.docker.compose.service={service})",
            shell=True, capture_output=True, text=True,
        ).stdout.strip()
        if health in ("healthy", ""):
            sys.exit(print(f"{service} deployed"))
        time.sleep(2)
    sys.exit(f"{service} deployed but not healthy")
sys.exit("deploy timed out")
PY
