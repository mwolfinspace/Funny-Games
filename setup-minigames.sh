#!/bin/bash
# =============================================================================
# setup-minigames.sh — One-time server setup for minigames.xedryk.top
# =============================================================================
set -eu

WEB_DIR="/mnt/data/www/minigames"
ENV_FILE="$WEB_DIR/backend/.env"
ENV_EXAMPLE="/mnt/data/workspace/Funny-Games/backend/env.example"

echo "==> Creating backend/.env from env.example"
cp "$ENV_EXAMPLE" "$ENV_FILE"

# Generate a random signing secret
SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
sed -i "s/^MG_SIGNING_SECRET=.*/MG_SIGNING_SECRET=$SECRET/" "$ENV_FILE"
sed -i "s|^MG_DATA_DIR=.*|MG_DATA_DIR=/srv/minigames/data|" "$ENV_FILE"
chown xedryk:xedryk "$ENV_FILE"
echo "    MG_SIGNING_SECRET set (first 16 chars: ${SECRET:0:16}...)"
echo "    MG_DATA_DIR set to /srv/minigames/data"

echo "==> Ensuring data dir exists"
mkdir -p /srv/minigames/data
chown xedryk:xedryk /srv/minigames/data

echo "==> Git safe.directory for deploy user"
git config --global --add safe.directory /mnt/data/workspace/Funny-Games 2>/dev/null || true

echo "==> Setup complete"