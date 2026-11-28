# Minigames Deploy — minigames.xedryk.top

## Architecture

```
Git push → Gitea webhook (port 9099)
         → webhook-minigames.py → deploy-minigames.sh
         → git fetch origin main + reset --hard origin/main
         → rsync repo → /mnt/data/www/minigames/  (nginx, port 8092)
         → static-only pushes: done (no Docker restart)
         → backend changes only: rebuild/restart minigames-hub
         → Caddy: minigames.xedryk.top → 127.0.0.1:8092
```

## Why Gitea pushes used to take minutes

Gitea 28 added an **egress policy** for webhooks. A webhook target on a
private, loopback, CGNAT, or Tailscale address is denied unless the address is
explicitly allowlisted. `ALLOWED_HOST_LIST = 0.0.0.0/0` does **not** count as an
explicit entry for non-public addresses, so every real push failed with:

```
denied by egress policy: 100.75.222.20(100.75.222.20)
needs an explicit IP allow entry (non-public address)
```

The webhook receiver never saw those pushes. The `minigames-watchdog` timer
(every 10 minutes) noticed the local HEAD was behind and deployed instead, which
is why updates appeared eventually but never instantly. The server copy of
`deploy-minigames.sh` also rebuilt the hub image and recreated **both**
containers on every push, adding ~15 s even for a one-line HTML change.

### Required Gitea egress entries

In `/mnt/data/gitea_data/gitea/conf/app.ini`:

```ini
[security]
EGRESS_MODE = lax
ALLOWED_HOST_LIST = host.docker.internal,127.0.0.1,172.16.0.0/12,10.200.1.1/32:9099,100.75.222.20/32:9099
```

The two `/32:9099` entries are the important ones: one for the Docker host
gateway (`host.docker.internal` → `10.200.1.1`) and one for the host's Tailscale
IP used by the current hook URL. Restart Gitea after editing (`docker restart
gitea-app`) and confirm new `hook_task` rows have `is_succeed = true`.

With the allowlist fixed, the webhook deploys in **about a second** for static
changes. The watchdog remains as a fallback; it can be left at 10 minutes or
lowered to 1 minute for faster recovery.

## Files in this repo

| File | Purpose | Server location |
|------|---------|-----------------|
| `docker-compose.yml` | Dockge stack: `minigames-web` + `minigames-hub` | `/mnt/data/docker/stacks/minigames/compose.yml` |
| `nginx/default.conf` | Nginx config: proxies `/api/mg/*` to hub | mounted in `minigames-web` container |
| `deploy-minigames.sh` | Deploy script (rsync + rebuild + restart) | `/usr/local/bin/deploy-minigames.sh` |
| `webhook-minigames.py` | Gitea webhook receiver on port 9099 | `/usr/local/bin/webhook-minigames.py` |
| `minigames-webhook.service` | systemd unit for the webhook | `/etc/systemd/system/minigames-webhook.service` |

## Option A — Gitea auto-deploy (recommended)

### 1. Gitea `ALLOWED_HOST_LIST` (required — webhooks silently fail without it)

In `core-cloud/compose.yaml`, add to the Gitea service environment:

```yaml
environment:
  - GITEA__security__ALLOWED_HOST_LIST=host.docker.internal,127.0.0.1,172.16.0.0/12,192.168.10.0/24
```

Recreate the Gitea container, then verify:

```bash
grep ALLOWED /mnt/data/gitea_data/gitea/conf/app.ini
```

### 2. Install the webhook receiver on the server

```bash
sudo cp webhook-minigames.py /usr/local/bin/webhook-minigames.py
sudo cp deploy-minigames.sh /usr/local/bin/deploy-minigames.sh
sudo cp minigames-webhook.service /etc/systemd/system/minigames-webhook.service
sudo chmod +x /usr/local/bin/deploy-minigames.sh /usr/local/bin/webhook-minigames.py
sudo systemctl daemon-reload
sudo systemctl enable --now minigames-webhook.service
```

### 3. Git safe.directory (required for the deploy user)

```bash
echo 'Hjk123phu@2026' | sudo -S git config --global --add safe.directory /mnt/data/workspace/Funny-Games
```

### 4. Add the Gitea webhook

In Gitea, go to the `Funny-Games` repository → Settings → Webhooks → Add webhook:

- **Target URL:** `http://host.docker.internal:9099/deploy/minigames`
  (or `http://<server-ip>:9099/deploy/minigames` if not using host.docker.internal)
- **HTTP Method:** POST
- **Content type:** `application/json`
- **Secret:** (optional, set `WEBHOOK_SECRET` env on the server if used)
- **Events:** Push only

### 5. Create the stack directory and compose on the server

```bash
sudo mkdir -p /mnt/data/docker/stacks/minigames
sudo cp docker-compose.yml /mnt/data/docker/stacks/minigames/compose.yml
sudo mkdir -p /mnt/data/www/minigames
sudo chown -R xedryk:xedryk /mnt/data/www/minigames /mnt/data/workspace/Funny-Games

cd /mnt/data/docker/stacks/minigames
sudo docker compose up -d
```

### 6. Caddy route for `/api/mg/*` (if not handled by nginx config)

The `nginx/default.conf` already proxies `/api/mg/*` → `minigames-hub:8907` inside the container. If Caddy needs a separate route, add to the Caddyfile:

```
minigames.xedryk.top {
    import cloudflare_tls
    reverse_proxy 127.0.0.1:8092
}
```

The `/api/mg/*` proxying is handled by nginx inside the container.

## Option B — Dockge "Update" / "Deploy"

Add the stack to Dockge using `/mnt/data/docker/stacks/minigames/compose.yml`.

- **Dockge "Deploy"** runs `docker compose up -d` — restarts `minigames-web` (picks up newly rsynced static files) and recreates `minigames-hub` if the image changed.
- **Dockge "Update"** pulls the latest `nginx:alpine` image and recreates the container.

> ⚠️ Dockge alone does **not** fetch new files from Gitea. You must still push to Gitea (which triggers the webhook deploy, rsyncing files to `/mnt/data/www/minigames/`) before using Dockge "Deploy". Without a push, Dockge only restarts the same static files.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Webhook fails with `denied by egress policy` / `needs an explicit IP allow entry` | Gitea 28 blocks webhooks to non-public addresses unless the IP is explicitly allowlisted | Add `10.200.1.1/32:9099` and `100.75.222.20/32:9099` to `[security] ALLOWED_HOST_LIST`, then `docker restart gitea-app` |
| Site updates only every 10 minutes | Webhook delivery is failing; the watchdog is deploying instead | Fix the egress allowlist above and check `hook_task.is_succeed` |
| Webhook not firing | `ALLOWED_HOST_LIST` missing in Gitea | Add to compose.yaml, recreate Gitea container |
| "dubious ownership" error | `safe.directory` not set | `git config --global --add safe.directory /mnt/data/workspace/Funny-Games` |
| New game not showing | Deploy didn't run after push | Check `deploy-minigames.log` and `webhook-minigames.log` |
| Site serves old content | Browser/Cloudflare cache | Hard refresh (Ctrl+F5) or purge Cloudflare cache |
| `/api/mg/` returns 404 | Nginx not proxying to hub | Verify `nginx/default.conf` is mounted, restart `minigames-web` |
| Hub not responding | `minigames-hub` container down | `docker compose -f .../compose.yml restart minigames-hub` |

## Logs

- Webhook: `/home/xedryk/webhook-minigames.log`
- Deploy: `/home/xedryk/deploy-minigames.log`
- Containers: `docker logs minigames-web` / `docker logs minigames-hub`

## Manual deploy

If the webhook fails, run directly on the server:

```bash
sudo /usr/local/bin/deploy-minigames.sh
```