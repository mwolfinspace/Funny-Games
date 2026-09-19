# Minigames Hub — backend & account system

Zero-dependency Node backend that powers accounts, medals, statistics, playtime
and per-device game saves for every game on **minigames.xedryk.top**. The GitHub
Pages deployment (`github.io`) is deliberately **locked out** — it can never
reach these endpoints, so players on GitHub keep the plain offline experience
while Gitea players get the full Hub.

```
GitHub pages (external)           ┌──────────── minigames.xedryk.top ────────────┐
┌────────────────────┐   no API   │  games (static)  ── scripts ──┐            │
│ pattern_ultimate…  │ ─────────┼▶ │                              ▼            │
│ (featureless)      │            │                   minigames-client.js       │
└────────────────────┘            │                      │  /api/mg/*           │
                                  │                      ▼                      │
                                  │        Minigames Hub backend  (PM2)        │
                                  │        backend/server.js  :8907             │
                                  │        └── backend-data/ (JSON stores)      │
                                  └─────────────────────────────────────────────┘
```

## 1. Host gating (how "full" vs "basic" is decided)

The client asks the backend for its **capabilities** with `GET /api/mg/capabilities`.
The browser automatically sends an `Origin` header. The backend decides:

| Origin                                        | mode      | features offered                 |
| --------------------------------------------- | --------- | -------------------------------- |
| `https://minigames.xedryk.top`                | `gitea`   | accounts, verify, reset, saves, stats, medals, library, sync |
| any other / no Origin (GitHub)                | `external`| none                             |

Extra origins can be allowed with `MG_ALLOWED_ORIGINS` (comma separated).

The envelope is HMAC-signed with `MG_SIGNING_SECRET`. The client asks the server
to confirm the signature (`POST /api/mg/mm/verify`), so a modified client that
hardcodes `"gitea"` gets rejected. **This is defense-in-depth, not the boundary**:
every state-changing endpoint independently requires a valid session token, and
the **server-side origin gate on the token flow is the real security**. Treat the
envelope as a feature switch, never as a privilege proof.

## 2. Feature flags for games

`minigames-client.js` exposes those flags after `await MG.init()`:

```js
await MG.init();
MG.mode;            // "gitea" | "external"
MG.isGitea;         // hostname-only sanity check
MG.has("accounts"); // boolean feature gate
MG.has("stats");
```

Games should call `MG.ready()` before offering Hub features:

```js
if (await MG.ready("saves")) { /* show cloud save UI */ }
```

When `MG.ready()` resolves `false`, fall back to the existing offline/local
behaviour — never force the player onto a broken save path.

## 3. Account flow

Players sign up with **email + password** (password kept only as a scrypt hash),
verify their email with a 6-8 char code, and can reset their password via email.
All emails are HTML and go through SMTP (`AUTH LOGIN`, STARTTLS or implicit TLS).
With no `SMTP_HOST` configured the emails are written as `.eml` files into
`<MG_DATA_DIR>/outbox` — handy for a dry run.

| Endpoint | Method | What it does |
| --- | --- | --- |
| `/api/mg/auth/signup` | POST | create account (`email`, `password`, `nickname?`) → email code |
| `/api/mg/auth/verify` | POST | confirm email with `code` |
| `/api/mg/auth/login` | POST | `email`+`password` → `token` (90-day session) |
| `/api/mg/auth/logout` | POST | invalidate `token` |
| `/api/mg/auth/me` | GET | current user profile (`Authorization: Bearer` or `?token=`) |
| `/api/mg/auth/change-password` | POST | `oldPassword` + `newPassword` |
| `/api/mg/auth/reset-request` | POST | email a reset code (never reveals if account exists) |
| `/api/mg/auth/reset-password` | POST | `email` + `code` + new `password` |

Rate limits: signup 5/min, login 10/min, reset 3/min per IP.

## 4. Per-device game saves

Each session can carry up to 90 days. Saves are namespaced by
`user + device + game + key` so the same account can have separate progress on
tablet vs desktop.

| Endpoint | Method | Body / Query |
| --- | --- | --- |
| `/api/mg/save` | PUT | `{ token, game, key?, data, device? }` (`key` defaults to `"default"`) |
| `/api/mg/save` | GET | `?token=&game=&key=&device=` → `{ ok, data, updatedAt }` |
| `/api/mg/saves` | GET | `?token=&game?` → `{ games: { <game>: { <key>: { data, device, updatedAt } } } }` |

## 5. Statistics, playtime & medals

Games report events; the backend aggregates and auto-awards medals. One call per
significant event is enough:

| Endpoint | Method | Body |
| --- | --- | --- |
| `/api/mg/stats` | POST | `{ token, game, event, value? }` where `event` ∈ `play`, `win`, `score` (`value`), `playtime` (`value` in ms) |
| `/api/mg/stats/me` | GET | `?token=` → `{ aggregate, rows }` per-game rows |
| `/api/mg/medals/catalog` | GET | list of all medals and their unlock rules (public) |
| `/api/mg/medals/mine` | GET | `?token=` → medals earned by the player |

The `POST /stats` response includes `newMedals` so you can toast a freshly
earned medal.

Medals are evaluated from aggregates every time stats change:

| Medal | Unlock |
| --- | --- |
| 👣 First Steps | play ≥ 1 game |
| 🎮 Emerging Gamer | play ≥ 5 games |
| 🤝 Loyal Companion | returned on ≥ 3 different days |
| 🏃 Marathoner | ≥ 60 min total playtime |
| 💯 Centurion | ≥ 100 total rounds |
| 🏆 Winner Winner | win anything |
| 🎯 Sharp Eye | best score ≥ 1000 in any game |
| ⚡ Speed Reader | ≥ 20 rounds in one day |

## 6. Client library (`minigames-client.js`)

Include before the game script on the Gitea host:

```html
<script src="minigames-client.js"></script>
<script src="my_game.js"></script>
```

```js
await MG.init();

// account UI
MG.account.signup(email, pw, nick);   => { ok }
MG.account.verify(email, code);       => { user }
MG.account.login(email, pw);          => { token }  (stored in sessionStorage)
MG.account.logout();
MG.account.me();                      => { user }
MG.account.forgot(email);
MG.account.reset(email, code, newPw);

// cloud saves
await MG.save.put("pattern", "levels", { cleared: 12, seed: "abc" });
const data = await MG.save.get("pattern", "levels");   // null if none
await MG.save.list("pattern");                          // { games: {...} }

// stats + medals
await MG.stats.event("pattern", "play");
await MG.stats.event("pattern", "score", 1234);
await MG.stats.event("pattern", "win");
await MG.stats.event("pattern", "playtime", 234567);
const mine = await MG.medals.mine();
```

If `MG.ready("saves")` is false, the UX should simply not render Hub buttons —
the game keeps its current offline/localStorage flow untouched.

## 7. Deploying on Gitea (deep setup guide)

### Prereqs on the host
- Node.js ≥ 18 (tested on 22). `node --version`.
- A writable data dir, e.g. `/srv/minigames/data` (chown to the service user).
- A real SMTP account for verify/reset emails (e.g. your host's mailserver or any provider with `AUTH LOGIN`).
- PM2: `npm i -g pm2` (or systemd — see "Alternative").

### Step 1 — files
Put the repo on the host, or at least:
```
backend/server.js  backend/collections.js  backend/store.js
backend/auth.js    backend/mail.js         backend/medals.js
minigames-client.js
backend/env.example (rename to .env or export vars)
```

### Step 2 — env
```bash
export PORT=8907
export MG_DATA_DIR=/srv/minigames/data
export MG_PUBLIC_URL=https://minigames.xedryk.top
export MG_SIGNING_SECRET="$(openssl rand -hex 32)"
export SMTP_HOST=...  SMTP_PORT=...  SMTP_USER=...  SMTP_PASS=...  SMTP_FROM=...
```
`SMTP_SECURE=true` only for implicit-TLS port 465; the client auto-negotiates
STARTTLS on 587/25.

### Step 3 — run under PM2
```bash
pm2 start backend/ecosystem.config.js
pm2 save
pm2 startup            # follow the printed command
pm2 logs minigames-hub # watch for `[mg] Minigames Hub backend listening on :8907`
```

### Step 4 — reverse proxy (nginx)
The games already use `https://gitea.xedryk.top/api/...`, so proxy `/api/mg/`
to the backend (the custom library server keeps its own `/api/library` route —
run it as a separate PM2 app, see `library-server.js`):

```nginx
location /api/mg/ {
    proxy_pass http://127.0.0.1:8907;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Origin $http_origin;        # keep the real Origin!
}
```
**Critical:** pass the browser’s `Origin` through untouched, and do **not** set a
blanket `Access-Control-Allow-Origin: *` on the `/api/` location — the origin
gate depends on it. The backend already replies with CORS headers (`*`) for
reads but the **token flow verbs (POST/PUT/DELETE) against the Hub are only
honoured for allowed origins**. Fetching with `credentials` isn’t needed; the
token rides in the JSON body / `Authorization` header.

### Step 5 — firewall
Bind PM2 to your private interface (127.0.0.1) if you only need the proxy, or
keep it bound publicly behind HTTPS. `PORT` changes the bind port only.

### Step 6 — verify
```bash
curl -s https://gitea.xedryk.top/api/mg/health                    # { ok: true }
curl -s -H "Origin: https://minigames.xedryk.top" \
     https://gitea.xedryk.top/api/mg/capabilities                 # mode "gitea" + features
curl -s -H "Origin: https://user.github.io" \
     https://gitea.xedryk.top/api/mg/capabilities                 # mode "external", []
curl -s https://gitea.xedryk.top/api/mg/medals/catalog            # public catalog
```

### Alternative: systemd unit
```ini
[Unit]
Description=Minigames Hub
After=network.target

[Service]
WorkingDirectory=/srv/minigames
ExecStart=/usr/bin/node backend/server.js
EnvironmentFile=/srv/minigames/backend/.env
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

## 8. Data layout & backups

`<MG_DATA_DIR>` contains one JSON array per collection, written atomically
(temp file + rename), so copying the folder while running never corrupts:

| file | contents |
| --- | --- |
| `users.json` | email, scrypt password hash, verify/reset code hashes, nickname |
| `sessions.json` | `tokenDigest` (sha256), user, device, expiry (90 d) |
| `device_saves.json` | user+device+game+key → data blob |
| `game_stats.json` | per user+game: plays, wins, playtimeMs, totals, best, play days |
| `medals.json` | awarded medals (id + timestamp) |
| `event_log.json` | reserved — verdict: events can be trivially spoofed by a tampered client; used only for optional admin analytics later |
| `outbox/` | `.eml` fallback emails when SMTP is not configured |

Back up with a simple cron: `rsync -a /srv/minigames/data /backup/minigames-data/`

## 9. Security notes
- Passwords: scrypt, per-user salt, constant-time verify. Never logged.
- Live session tokens never stored — only SHA-256 digests (DB leak ≠ usable tokens).
- Auth + password/reset actions: per-IP rate limiting.
- Reset-request never discloses whether an account exists.
- Saves/stats/medals endpoints require a valid non-expired session.
- `MG_SIGNING_SECRET` leakage weakens the envelope only; origin gate + token
  requirement remain the actual account boundary.

## 10. Future / notes
- The JSON store is intentionally swappable for Postgres by keeping the
  collection interface (`find/filter/update/all`).
- GitHub deploy policy: existing pages are untouched; new games ship with
  `minigames-client.js` included so the **same html runs full-featured on Gitea
  and basic on GitHub** with zero branching for offline flows.
- Live/deploy keys are managed on the Gitea host (they are **not** committed).