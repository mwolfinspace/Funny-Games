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

### pattern_ultimate integration (done)

`pattern_ultimate.html` now includes `minigames-client.js` and repoints its whole
library system at the Hub:

- **Library storage** = a per-account save blob: `MG.save.put("pattern", "library", globalLibrary)`.
- **Open loading** (`initGlobalLibrary`): on Gitea it reads `MG.save.get("pattern","library")`;
  with no account library yet it falls back to the bundled `pattern_user_puzzle.json`
  (read-only baseline), exactly like GitHub/localhost.
- **Password** = the Hub account: the old `#libPassModal` is now a login / signup /
  verify / reset form (`ensureHubAuth`). Success keeps the token in sessionStorage
  (persists across reloads in the same tab).
- **Add / Remove / Commit**: `saveCurrentToLibrary` (💾), `executeDeletePuzzle` (❌)
  and `syncLibraryToServer` (🚀 or 3× click on the seed) all mutate `globalLibrary`
  locally and persist through `saveLibraryToHub` → `MG.save.put`. Anonymous visitors
  can browse but every mutation prompts for the account first.
- GitHub/local stays untouched: `libraryServerReachable()` is only true after the
  signed capabilities envelope reports `gitea` mode, so the GitHub pages copy still
  reads `pattern_user_puzzle.json` (local, read-only) and hides the Hub save/commit
  buttons.

The standalone `library-server.js` (old `/api/library` password API) is no longer
used by `pattern_ultimate` — keep it running only if another page still calls it.

## 7. Deploying (auto-deploy on the minigames host)

### How updates flow (this repo's workflow)
1. Any change/update is committed and pushed to **gitea** (`git push origin main`).
2. The `minigames.xedryk.top` host auto-pulls the repo and serves the static
   files (games + `minigames-client.js`) immediately — no extra step.
3. The API part is the same pattern as the other self-hosted Node services
   (`library-server.js`, `lan-signaling-server.js`): the host runs
   `backend/server.js` and its `/api/*` gateway routes `/api/mg/*` to it.
   This route lives in the host's gateway config (not in the repo) — add it
   once and push-through forever after.

The Hub client always calls **same-origin** `/api/mg` (`location.origin + "/api/mg"`),
so it works unchanged whether the page is served by `minigames.xedryk.top` or a
future domain. Until `/api/mg` responds on that origin the game auto-degrades to
`external` mode and hides the Hub buttons (`libraryServerReachable()` is false).

### Prereqs on the host
- Node.js ≥ 18 (tested on 22). `node --version`.
- A writable data dir, e.g. `/srv/minigames/data` (chown to the service user).
- A real SMTP account for verify/reset emails (e.g. your host's mailserver or any provider with `AUTH LOGIN`).
- PM2: `npm i -g pm2` (or systemd — see "Alternative").

### Step 1 — files
The auto-deploy already places the whole repo on the host. The minimal set the
backend needs:
```
backend/server.js  backend/env.js          backend/collections.js
backend/store.js   backend/auth.js         backend/mail.js
backend/medals.js  backend/ecosystem.config.js  backend/install.sh
minigames-client.js
```

### Step 2 — env
Copy `backend/env.example` → `backend/.env` and fill it in. `backend/env.js`
loads it automatically on boot (only fills keys that aren’t already set), so
both bare `node backend/server.js` and PM2 read the same file:

```bash
cp backend/env.example backend/.env
# PORT=8907, MG_DATA_DIR=/srv/minigames/data,
# MG_PUBLIC_URL=https://minigames.xedryk.top,
# MG_SIGNING_SECRET=<random — install.sh generates one>  SMTP_*
```
`SMTP_SECURE=true` only for implicit-TLS port 465; the client auto-negotiates
STARTTLS on 587/25.

### Step 3 — run under PM2
The whole flow is scripted and idempotent — run once on the host:

```bash
bash backend/install.sh
# writes backend/.env, creates the data dir, pm2 start + save
pm2 startup         # follow the printed command (boot persistence)
pm2 logs minigames-hub   # watch for `Minigames Hub backend listening on :8907`
```

### Step 4 — route `/api/mg` on the host gateway
The host's existing `/api/*` gateway (the one already serving `/api/ocr` etc.
and the “Xedryk Server Status” catch-all) must add one route: everything under
`/api/mg/` → the Hub backend on `127.0.0.1:8907`. Give this snippet to your
gateway (nginx, Caddy, or Cloudflare Worker whichever hosts the site):

```nginx
location /api/mg/ {
    proxy_pass http://127.0.0.1:8907;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Origin $http_origin;        # keep the real Origin!
}
```
**Critical:** pass the browser’s `Origin` through untouched, and do **not** let a
blanket `Access-Control-Allow-Origin: *` or a catch-all `/api` redirect swallow
this location — the origin gate depends on it. The backend already replies with
CORS headers (`*`) for reads but the **token flow verbs (POST/PUT/DELETE)
against the Hub are only honoured for allowed origins**. Fetching with
`credentials` isn’t needed; the token rides in the JSON body / `Authorization`
header.

### Step 5 — firewall
Bind the backend to your private interface (127.0.0.1) if the gateway proxies
locally, or keep it bound publicly behind HTTPS. `PORT` changes the bind only.

### Step 6 — verify
```bash
curl -s https://minigames.xedryk.top/api/mg/health                  # { ok: true }
curl -s -H "Origin: https://minigames.xedryk.top" \
     https://minigames.xedryk.top/api/mg/capabilities               # mode "gitea" + features
curl -s -H "Origin: https://user.github.io" \
     https://minigames.xedryk.top/api/mg/capabilities               # mode "external", []
curl -s https://minigames.xedryk.top/api/mg/medals/catalog          # public catalog
```
When `health` returns `{ ok: true }` the page flips to Hub mode and the 💾 /
🚀 buttons appear on `pattern_ultimate` automatically (no browser cache worry —
`MG.init()` runs on every load).

### Email note for the first real account
Until SMTP is set, `SMTP_HOST` stays empty and verify/reset emails are written
as `.eml` files into `<MG_DATA_DIR>/outbox/`. To create the first account
(before SMTP), sign up in the game's account modal, then open
`/srv/minigames/data/outbox/*.eml` on the host and type the code from it — the
account is then verified and usable forever. This is also why “only one account /
no self-serve signup” appears right after wiring-up: self-serve signups unlock
the instant SMTP is configured.

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