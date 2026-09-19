#!/usr/bin/env bash
# One-shot installer for the Minigames Hub backend on the auto-deploy host.
# Run from a fresh pull of the repo (or after `git pull`). Idempotent.
#
#   bash backend/install.sh
#
# Afterwards, the ONLY other manual step is the gateway route (outside this
# repo): make the host's /api gateway forward  /api/mg/*  -> 127.0.0.1:8907
# (pass the browser Origin through). See MINIGAMES_BACKEND.md §7.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DATA_DIR="${MG_DATA_DIR:-/srv/minigames/data}"

echo "==> Minigames Hub installer"
echo "    repo   : $ROOT"
echo "    data   : $DATA_DIR"

# 1) .env from the example, with a random signing secret the first time.
if [ ! -f backend/.env ]; then
  cp backend/env.example backend/.env
  SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  perl -0pi -e "s/^MG_SIGNING_SECRET=.*/MG_SIGNING_SECRET=$SECRET/m" backend/.env \
    || sed -i "s/^MG_SIGNING_SECRET=.*/MG_SIGNING_SECRET=$SECRET/" backend/.env
  echo "    wrote backend/.env (fresh random MG_SIGNING_SECRET)."
  echo "    EDIT it to set real SMTP_* values if mailbox email is wanted."
else
  echo "    backend/.env already present — leaving untouched."
fi

# 2) data dir (JSON stores + outbox/). Warn if it will be a local dir.
if [ ! -d "$DATA_DIR" ]; then
  mkdir -p "$DATA_DIR"
  echo "    created $DATA_DIR"
fi
# Make sure the .env picks this data dir up (unless it was explicitly set).
grep -q '^MG_DATA_DIR=' backend/.env || echo "MG_DATA_DIR=$DATA_DIR" >> backend/.env

# 3) syntax check + quick boot check
node --check backend/server.js
node --check backend/env.js

# 4) run under PM2 if available, else bare nohup.
if command -v pm2 >/dev/null 2>&1; then
  pm2 start backend/ecosystem.config.js
  pm2 save
  echo "    pm2 has started 'minigames-hub'. For boot persistence run:"
  echo "    pm2 startup    # then paste the printed command"
else
  echo "    pm2 not found — starting with nohup instead (no auto-restart)."
  nohup node backend/server.js >> "$DATA_DIR/server.log" 2>&1 &
  echo "    pid $! ; logs: $DATA_DIR/server.log"
fi

# 5) local health check
sleep 1
PORT="$(grep '^PORT=' backend/.env | cut -d= -f2)"
PORT="${PORT:-8907}"
echo "==> local health check:"
curl -sf "http://127.0.0.1:$PORT/health" && echo || echo "    (not up yet — check the logs above)"

echo
echo "==> Done. Remaining manual step (outside the repo):"
echo "    gateway route  /api/mg/*  -> 127.0.0.1:$PORT"
echo "    then verify:  curl https://minigames.xedryk.top/api/mg/health"
echo "=> expect { ok: true } — the game then shows its save/account UI."