#!/bin/bash
# =============================================================================
# deploy-minigames.sh — Gitea webhook / manual / watchdog deploy
# =============================================================================
# Flow:
#   1. lock (no overlapping deploys)
#   2. git fetch origin main + git reset --hard origin/main (Gitea = source of truth)
#   3. rsync repo -> /mnt/data/www/minigames/ (static files are live immediately)
#   4. only if backend files changed: rebuild/recreate minigames-hub
#   5. ensure the webhook listener is running
#   6. mirror to GitHub (best effort)
#
# Static-only pushes do NOT touch Docker at all. nginx serves the bind-mounted
# files directly, so the site is updated as soon as rsync finishes.
# =============================================================================
set -euo pipefail
exec 9>/run/minigames-deploy.lock
flock -n 9 || { echo "another minigames deploy is already running; skipping"; exit 0; }

REPO_DIR="/mnt/data/workspace/Funny-Games"
WEB_DIR="/mnt/data/www/minigames"
LOG="/home/xedryk/deploy-minigames.log"
COMPOSE_FILE="/mnt/data/docker/stacks/minigames/compose.yml"

export GIT_TERMINAL_PROMPT=0

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

log "Starting minigames deploy"

cd "$REPO_DIR"
log "git fetch origin main"
git fetch --prune origin main 2>&1 | tee -a "$LOG"
log "git reset --hard origin/main"
git reset --hard origin/main 2>&1 | tee -a "$LOG"
GIT_SHA=$(git rev-parse --short HEAD)
log "Gitea HEAD: $GIT_SHA"

# --- Detect backend changes BEFORE rsync (compare repo vs deployed copy) -----
backend_changed=0
dockerfile_changed=0
if [ ! -d "$WEB_DIR/backend" ] || ! diff -qr \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='backend-data' \
    "$REPO_DIR/backend" "$WEB_DIR/backend" >/dev/null 2>&1; then
  backend_changed=1
fi
if [ ! -f "$WEB_DIR/backend/Dockerfile.hub" ] || \
   ! cmp -s "$REPO_DIR/backend/Dockerfile.hub" "$WEB_DIR/backend/Dockerfile.hub"; then
  dockerfile_changed=1
fi

# --- Static files: rsync only, served instantly by nginx ---------------------
log "rsync -> $WEB_DIR"
rsync -a --delete \
  --exclude='.git' \
  --exclude='backend/.env' \
  --exclude='backend/.env.local' \
  --exclude='backend-data' \
  --exclude='.deploy-refs' \
  ./ "$WEB_DIR/" 2>&1 | tee -a "$LOG"

# --- Backend: rebuild only when needed, restart only when code changed ------
if [ "$dockerfile_changed" -eq 1 ]; then
  log "Dockerfile.hub changed — rebuilding minigames-hub:local"
  docker build -f "$WEB_DIR/backend/Dockerfile.hub" -t minigames-hub:local "$WEB_DIR" 2>&1 | tee -a "$LOG"
  log "recreating minigames-hub"
  docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate minigames-hub 2>&1 | tee -a "$LOG"
elif [ "$backend_changed" -eq 1 ]; then
  log "backend changed — restarting minigames-hub"
  docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate minigames-hub 2>&1 | tee -a "$LOG"
else
  log "static-only deploy — no container restart"
fi

# --- Self-heal the webhook listener -----------------------------------------
if ! systemctl is-active --quiet minigames-webhook.service; then
  log "webhook listener was down — restarting it"
  systemctl restart minigames-webhook.service 2>&1 | tee -a "$LOG" || true
fi

# --- Mirror to GitHub (best effort) -----------------------------------------
cd "$REPO_DIR"
log "git push github main"
git push github main 2>&1 | tee -a "$LOG" || true

log "Deploy complete ($GIT_SHA)"
