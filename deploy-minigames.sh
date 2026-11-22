#!/bin/bash
# =============================================================================
# deploy-minigames.sh — Gitea webhook deploy for minigames.xedryk.top
# =============================================================================
# Triggered by: webhook-minigames.py (POST /deploy/minigames) on Gitea push
# Also usable manually:  sudo /usr/local/bin/deploy-minigames.sh
#
# Flow:
#   1. git fetch --all + git reset --hard origin/main   (sync server workspace)
#   2. rsync repo → /mnt/data/www/minigames/            (static site files)
#   3. If backend/server.js or backend/Dockerfile.hub changed:
#      - rebuild minigames-hub image (docker build -f backend/Dockerfile.hub)
#      - recreate minigames-hub container
#   4. Touch minigames-web (nginx) so Dockge "update" sees a change
#   5. git push github main (mirror to GitHub)
# =============================================================================
set -euo pipefail

REPO_DIR="/mnt/data/workspace/Funny-Games"
WEB_DIR="/mnt/data/www/minigames"
LOG="/home/xedryk/deploy-minigames.log"
BACKEND_SERVER="$WEB_DIR/backend/server.js"
DOCKERFILE_HUB="$WEB_DIR/backend/Dockerfile.hub"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting minigames deploy" | tee -a "$LOG"

# --- 1. Sync server workspace from Gitea -------------------------------------
cd "$REPO_DIR"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] git fetch --all" | tee -a "$LOG"
git fetch --all 2>&1 | tee -a "$LOG"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] git reset --hard origin/main" | tee -a "$LOG"
git reset --hard origin/main 2>&1 | tee -a "$LOG"

# --- 2. rsync static files to the www dir (served by nginx on 8092) ---------
echo "[$(date '+%Y-%m-%d %H:%M:%S')] rsync → $WEB_DIR" | tee -a "$LOG"
rsync -av --delete \
  --exclude='.git' \
  --exclude='backend/.env' \
  --exclude='backend/.env.local' \
  --exclude='backend-data' \
  ./ "$WEB_DIR/" 2>&1 | tee -a "$LOG"

# --- 3. Detect backend changes and rebuild/restart minigames-hub -------------
before=$(sha256sum "$BACKEND_SERVER" 2>/dev/null | awk '{print $1}' || true)
df_before=$(sha256sum "$DOCKERFILE_HUB" 2>/dev/null | awk '{print $1}' || true)

# Compare against the previously deployed copies (keep a reference hash file)
REF_DIR="$WEB_DIR/.deploy-refs"
mkdir -p "$REF_DIR"
ref_server="$REF_DIR/server.js.sha256"
ref_df="$REF_DIR/Dockerfile.hub.sha256"

ref_server_old=$(cat "$ref_server" 2>/dev/null || true)
ref_df_old=$(cat "$ref_df" 2>/dev/null || true)

restart_hub=0
if [ "${before:-}" != "${ref_server_old:-}" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] backend/server.js changed — rebuilding minigames-hub" | tee -a "$LOG"
  cd "$WEB_DIR/backend"
  docker build -f Dockerfile.hub -t minigames-hub:local . 2>&1 | tee -a "$LOG"
  docker compose -f /mnt/data/docker/stacks/minigames/compose.yml up -d --force-recreate minigames-hub 2>&1 | tee -a "$LOG" || \
    docker run -d --name minigames-hub --restart unless-stopped -p 127.0.0.1:8907:8907 \
      -v "$WEB_DIR:/repo:ro" minigames-hub:local 2>&1 | tee -a "$LOG" || true
  restart_hub=1
fi

if [ "${df_before:-}" != "${ref_df_old:-}" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] backend/Dockerfile.hub changed — recreating minigames-hub" | tee -a "$LOG"
  cd "$WEB_DIR/backend"
  docker build -f Dockerfile.hub -t minigames-hub:local . 2>&1 | tee -a "$LOG"
  docker compose -f /mnt/data/docker/stacks/minigames/compose.yml up -d --force-recreate minigames-hub 2>&1 | tee -a "$LOG" || true
  restart_hub=1
fi

# Save reference hashes
echo "${before:-}" > "$ref_server"
echo "${df_before:-}" > "$ref_df"

# --- 4. Bump minigames-web so Dockge "update" / compose sees a change -------
# nginx serves static files; a container restart picks up new files from the
# bind-mounted volume. We touch a marker file so compose "up -d" recreates it.
MARKER="$WEB_DIR/.deployed-at"
date +%s > "$MARKER"

if [ -f /mnt/data/docker/stacks/minigames/compose.yml ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] docker compose up -d minigames-web" | tee -a "$LOG"
  docker compose -f /mnt/data/docker/stacks/minigames/compose.yml up -d minigames-web 2>&1 | tee -a "$LOG" || true
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] docker restart minigames-web (fallback)" | tee -a "$LOG"
  docker restart minigames-web 2>&1 | tee -a "$LOG" || true
fi

# --- 5. Mirror to GitHub ------------------------------------------------------
echo "[$(date '+%Y-%m-%d %H:%M:%S')] git push github main" | tee -a "$LOG"
git push github main 2>&1 | tee -a "$LOG" || true

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy complete" | tee -a "$LOG"