#!/usr/bin/env python3
# =============================================================================
# webhook-minigames.py — Gitea push webhook receiver for minigames.xedryk.top
# =============================================================================
# Binds 0.0.0.0:9099.  Gitea webhook URL:
#   http://<host>:9099/deploy/minigames   (event: push)
#
# Required Gitea config (core-cloud/compose.yaml environment):
#   GITEA__security__ALLOWED_HOST_LIST=host.docker.internal,127.0.0.1,172.16.0.0/12,10.200.1.1/32:9099,100.75.222.20/32:9099
# Gitea 28 rejects non-public webhook targets without an explicit /32:port entry;
# a catch-all like 0.0.0.0/0 is explicitly ignored.
#
# systemd unit: /etc/systemd/system/minigames-webhook.service
#   [Unit]   Description=Minigames Gitea Webhook Receiver
#   [Service] ExecStart=/usr/bin/python3 /usr/local/bin/webhook-minigames.py
#             User=root  Restart=always
#   [Install] WantedBy=multi-user.target
# =============================================================================
import hashlib
import hmac
import json
import logging
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = int(os.environ.get("WEBHOOK_PORT", "9099"))
LOG_FILE = "/home/xedryk/webhook-minigames.log"

# Webhook secret — set in Gitea webhook config and here (empty = accept all)
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")

# Route → deploy script
DEPLOY_SCRIPTS = {
    "/deploy/minigames": "/usr/local/bin/deploy-minigames.sh",
}

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)

def log(msg):
    print(msg, flush=True)
    logging.info(msg)

class HookHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        log("%s - %s" % (self.client_address[0], fmt % args))

    def _send(self, code, body):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        script = DEPLOY_SCRIPTS.get(path)
        if not script:
            log(f"404 unknown route: {self.path}")
            self._send(404, "unknown route\n")
            return

        # Read body
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b""

        # Optional HMAC signature check (Gitea X-Hub-Signature: sha256=...)
        if WEBHOOK_SECRET:
            sig = self.headers.get("X-Hub-Signature", "")
            expected = "sha256=" + hmac.new(
                WEBHOOK_SECRET.encode(), body, hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(sig, expected):
                log("401 bad HMAC signature")
                self._send(401, "bad signature\n")
                return

        # Verify it's a push event (Gitea sends X-Gitea-Event: push)
        event = self.headers.get("X-Gitea-Event", "")
        if event and event != "push":
            log(f"ignoring non-push event: {event}")
            self._send(202, f"ignored event {event}\n")
            return

        log(f"Gitea push received → running {script}")
        try:
            # Spawn deploy script detached so we can return 202 immediately
            subprocess.Popen(
                ["bash", script],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            self._send(202, "deploy accepted\n")
        except Exception as exc:
            log(f"deploy failed to start: {exc}")
            self._send(500, f"deploy start failed: {exc}\n")

    def do_GET(self):
        if self.path == "/health":
            self._send(200, "ok\n")
        else:
            self._send(404, "not found\n")

def main():
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), HookHandler)
    log(f"webhook-minigames listening on {LISTEN_HOST}:{LISTEN_PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()

if __name__ == "__main__":
    main()