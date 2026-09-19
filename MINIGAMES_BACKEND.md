# Minigames Hub — backend & account system

Zero-dependency Node backend that powers accounts, medals, statistics, playtime
and per-device game saves for every game on **minigames.xedryk.top**. GitHub
Pages (static hosting) can't do server-side work, so the **GitHub copy simply
calls the Hub back on our own server** — the page is passive, every dynamic
feature (accounts, saves, medals) runs here either way.

```
GitHub pages (external)            ┌──────────── minigames.xedryk.top ────────────┐
┌───────────────────┐   /api/mg    │  games (static)  ── scripts ──┐            │
│ pattern_ultimate… │ ───────────▶ │  (incl. GitHub copy)          ▼            │
│ (remote Hub UI)   │              │                   minigames-client.js       │
└───────────────────┘              │                      │  /api/mg/*           │
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
| `https://minigames.xedryk.top`                | `gitea`   | accounts, verify, reset, saves, stats, medals, library, sync, chess, codes |
| `https://mwolfinspace.github.io` (GitHub copy)| `gitea`   | accounts, verify, reset, saves, stats, medals, library, sync, chess, codes |
| any other Origin present                      | `external`| none                             |

**Same-origin note:** browsers omit the `Origin` header on same-origin GETs, so
requests with **no** `Origin` whose `Host` is the hub's own public site (the
`minigames.xedryk.top` copy) are treated as first party and get `gitea`. A
present `Origin` always wins the table above, so foreign origins stay
`external`. This is what made the hub host show save/delete/libraries while the
GitHub copy already worked.

More static deploys can be allowed with `MG_ALLOWED_ORIGINS` (comma separated).

The envelope is HMAC-signed with `MG_SIGNING_SECRET`. The client asks the server
to confirm the signature (`POST /api/mg/mm/verify`), so a modified client that
hardcodes `"gitea"` gets rejected. **Be clear about what this is:** the origin
gate is a *feature switch*, not a security boundary — an `Origin` header is
trivially spoofable from non-browser clients. Real protection is the session
token on every state change, password + email verification at signup, and
per-IP rate limiting. That is true no matter which origin the copy is served
from.

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
- **Open loading** (`initGlobalLibrary`): on Hub mode (minigames host **or**
  the GitHub Pages copy) it reads `MG.save.get("pattern","library")`;
  with no account library yet it falls back to the bundled `pattern_user_puzzle.json`
  (read-only baseline).
- **Password** = the Hub account: the old `#libPassModal` is now a login / signup /
  verify / reset form (`ensureHubAuth`). Success keeps the token in sessionStorage
  (persists across reloads in the same tab).
- **Add / Remove / Commit**: `saveCurrentToLibrary` (💾), `executeDeletePuzzle` (❌)
  and `syncLibraryToServer` (🚀 or 3× click on the seed) all mutate `globalLibrary`
  locally and persist through `saveLibraryToHub` → `MG.save.put`. Anonymous visitors
  can browse but every mutation prompts for the account first.
- Anywhere it runs, Hub mode is decided by the server-confirmed capabilities
  envelope (`libraryServerReachable()` ⇐ `cap.mode === "gitea"`). The GitHub copy
  calls the remote Hub and shows the save/commit buttons just like the minigames
  copy — same accounts, same saves. If the Hub is unreachable every copy silently
  degrades to local read-only mode.

The standalone `library-server.js` (old `/api/library` password API) is no longer
used by `pattern_ultimate` — keep it running only if another page still calls it.

### Real-time library sync (WebSocket, `/api/mg/ws`)

Per-account library saves sync across devices **instantly** over a zero-dep
WebSocket channel on the hub:

- `MG.live.connect()` after login → authed handshake on `/api/mg/ws`; the client
  subscribes and receives `{type:"save:updated", game, key, device, revision}`
  pushes whenever a linked device commits a save (or an admin revert fires).
- `pattern_ultimate` runs **socket-first** (`startLibraryLive`):
  - message arrives → `syncLibraryFromHub()` pulls the fresh library and merges;
  - the old 5 s `?meta=1` revision poll stays as a fallback that only ticks when
    the socket is **not** connected, so offline/unstable networks still converge.
- The socket auto-reconnects with backoff (1 s → 2 s → 4 s … capped ≈ 60 s) and
  closes cleanly on logout. Guests get no socket; the poll stays off too.

### Server-side chess AI (Stockfish on the Hub)

`chess_ultimate.html` no longer needs strong compute in the browser. When a
logged-in player faces the AI on a `gitea` origin, the game sends the FEN (plus
`level` and desired `movetime`) to the Hub, which runs a real **Stockfish 15.1**
(UCI) on the server and returns `bestmove` — ~0.5–1 s, strength 2300–2750 Elo
(no `wasm.js` engine download, no thread starvation on small phones). The old
in-browser Stockfish + minimax remains as a **failsafe**: offline, blocked,
rate-limited, or engine-down ⇒ automatic local fallback, then an exponential
backoff (cap ≈ 15 s) with re-probes so the server path re-arms when the network
returns. Guests / non-`gitea` origins keep using the local engine untouched.

| Endpoint | Method | Body / Query |
| --- | --- | --- |
| `/api/mg/chess/move` | POST | `{ token, fen, level?, movetime? }` → `{ ok, move, depth, scoreCp, mate?, pv[], engine, level, movetime }` |
| `/api/mg/chess/ping` | GET | `?token=` → `{ ok, engine, version }` (ready flag + Stockfish version) |

- `level` 1–4 ⇐ elo 2300 / 2450 / 2550 / 2750 (UCI_LimitStrength + Contempt);
  clamped otherwise. `movetime` 100–3000 ms (client uses
  `200+level*200`, ≥300 ms or the current demo delay).
- The FEN is strictly validated (8 ranks, valid turn, castling, en-passant,
  half/full move) and `level`/`movetime` are clamped before ever reaching the
  engine — garbage in ⇒ `400`, no engine work done.
- Requires a valid session (`401`) and is **rate limited 30 req/min per IP and
  per user** (`429`) so the shared engine can't be hammered into a lobby.
- A single Stockfish process is reused (serialized queue); it auto-restarts on
  crash/hang and, if even the boot handshake fails, the endpoint answers `503`
  and the client keeps playing with the local fallback.
- Debian hub image carries Stockfish in `/usr/games/stockfish`; no repo binary,
  reproducible via `backend/Dockerfile.hub` (see §7).

### Short game codes (seed tickets)

Any game can tuck its long recovery seed on the Hub and get a **super-short,
cross-game unique code** back — like a ticket that redeems to the original seed.
This is the pattern chess uses: a full-state seed (`S2-…`, base64url of
mode/level/clocks/turn/history) is minted to codes that stay up to date as the
game progresses (a "time code"), so a student can re-open the exact same setup
anytime.

| Endpoint | Method | Auth | Rate | Body / Query | Returns |
| --- | --- | --- | --- | --- | --- |
| `/api/mg/codes` | POST | login | 20/min per IP+user | `{ game, seed }` | `{ ok, code, game }` |
| `/api/mg/codes/lookup` | GET | public | — | `?code=` | `{ ok, code, game, seed }` |

- Codes are 7 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31 letters, no
  I/L/O/0/1) — easy to read aloud, ∼27.5B distinct values, well under 8.
- **Idempotent**: minting the same `game|seed` twice returns the existing code
  and never duplicates — codes are stable "time codes" that only change when the
  game state does. The reserved code index is rebuilt from `seed_codes.json` at
  boot, so a restarted hub still resolves old codes.
- Mint requires a session + rate budget; **lookup is public** (anyone holding a
  code may spend it — good for sharing a puzzle to a classroom).
- Stored in the `seed_codes` collection (`backend-data/seed_codes.json`), backed
  up with the rest of the data; mints are signed to the audit log with the
  `SHA-256` of the seed (full seed never logged).
- Client: `MG.codes.mint(game, seed)` → `{ code }`, `MG.codes.open(code)` →
  `{ seed }`. Chess resolves 7-char codes in `loadSeed()` before any other seed
  parsing, and mints codes automatically (throttled ≥2.5 s, cached per seed).
  Chess clock times are stored at **minute granularity** (`floor(s/60)*60`), so
  a "time code" only re-mints on a move or a whole-minute boundary — stable
  enough to copy mid-game instead of churning every second.
- **Pattern (shape game)**: same flow with `game: "pattern"`. Loading is
  **fully public** — any student pastes the 7-char code (seed input, floating
  box, or a `?seed=CODE` share URL) and `resolveSeedRef()` swaps it for the real
  seed via the public lookup, no account needed. Minting follows a
  **failsafe**: the short code only shows (toolbar chip, quick-copy, 🔗 share
  URL) while the hub is connected **and** the mint for the current seed
  succeeded; the moment it fails/off-lines the chip drops back to `—` and the
  long seed id stays the shareable one. Mint still requires a login (spam
  guard); seeds are stored as plain text, so cost is negligible. Seed length
  cap is 8000 chars.

## 7. Deploying (auto-deploy on the minigames host)

### How updates flow (this repo's workflow)
1. Any change/commit is pushed to **gitea** (`git push origin main`).
2. The host's webhook runs `deploy-minigames.sh`: `git reset --hard origin/main`
   → `rsync ./ → /mnt/data/www/minigames` (hub's `/repo`) → **if**
   `backend/server.js` or `backend/Dockerfile.hub` changed, it rebuilds the hub
   image (`docker build -f backend/Dockerfile.hub -t minigames-hub:local`) and
   recreates the container → `git push github main`.
3. The static files (games + `minigames-client.js`) update immediately.

### Cache caveat (Cloudflare, 4h TTL)
`minigames-client.js` is served with `Cache-Control: max-age=14400`, so
Cloudflare can keep serving a stale copy for up to 4 hours after a push. The `<script src="minigames-client.js?v=N">` tag in `pattern_ultimate.html` uses a
cache-busting query — **bump `?v=` whenever `minigames-client.js` changes**
(pages themselves are not edge-cached, so the bump propagates on the next pull).
Or purge: Cloudflare dashboard → Caching → Purge everything. Verify what is
actually served with:
```bash
curl -sI https://minigames.xedryk.top/minigames-client.js  # look for cf-cache-status
```

The Hub client calls **same-origin** `/api/mg` on a hub host, and the remote Hub
URL from any static deploy (see §1). Until `/api/mg` responds on that origin the
game auto-degrades to `external` mode and hides the Hub buttons
(`libraryServerReachable()` is false).

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
backend/medals.js  backend/engine.js       backend/Dockerfile.hub
backend/ecosystem.config.js  backend/install.sh
minigames-client.js
```

The hub runs as a **Docker container** (`minigames-hub`, image built from
`backend/Dockerfile.hub` — `node:20-bookworm-slim` + the `stockfish` apt
package). The whole repo is bind-mounted read-only at `/repo` so a push is
instantly live; only engine/backend rebuilds recreate the container. That means
**deploys never download Stockfish into the browser** — the engine binary is a
base-image layer, rebuilt on host only when the Dockerfile/`server.js` changes.

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
curl -s -H "Origin: https://mwolfinspace.github.io" \
     https://minigames.xedryk.top/api/mg/capabilities               # mode "gitea" + features (GitHub copy)
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
| `event_log.json` | append-only, hash-chained, HMAC-signed audit journal of every state change (see §9) |
| `save_snapshots.json` | versioned snapshots of every committed save (keeps newest 10 per user+game+key+device) |
| `outbox/` | `.eml` fallback emails when SMTP is not configured |

Back up with a simple cron: `rsync -a /srv/minigames/data /backup/minigames-data/`

## 9. Signed audit trail & revert (owner admin)

Every state change (signup, verify, login, logout, reset-request/reset-password,
change-password, save, admin reverts) appends a **signed entry** to the audit
journal instead of trusting a client-supplied event:

```json
{ "seq": 42, "ts": "2026-09-19T…Z", "prevHash": "<sha256 of prev entry>",
  "actor": "u_…", "action": "save", "userId": "u_…", "game": "pattern",
  "key": "library", "dataHash": "<sha256 of the committed payload>",
  "detail": "snapshot=sn_…",
  "sig": "<HMAC-SHA256(MG_SIGNING_SECRET, seq|ts|prevHash|action|dataHash)>",
  "hash": "<sha256 of sig payload + sig>" }
```

Entries are chained (`prevHash`) and individually signed with
`MG_SIGNING_SECRET`, so editing or deleting an older entry breaks every later
link and signature — an agent or the owner can verify the whole journal with
`?verify=1` and get `{ valid: true, count }` (or the index of the first bad
entry). High-frequency telemetry (stat events, medal awards) is intentionally
*not* in the chain — it lives in `game_stats.json`.

Each `PUT /api/mg/save` also commits a **snapshot** of the new value to
`save_snapshots.json` (newest 10 kept per user+game+key+device). Deleting a
puzzle/library entry is just such a save, so any version can be inspected and
restored.

### Owner auth

Admin endpoints are gated to the site owner either way:

- session token of a logged-in account whose email is in `MG_OWNER_EMAIL`, or
- `sha256(MG_SIGNING_SECRET + ":owner")` sent as `?owner=` or the
  `X-MG-Owner-Key` header (no account needed — handy for scripts/agents).

### Endpoints (all under `/api/mg/admin/`)

| Method & path | Purpose |
| --- | --- |
| `GET /audit?after=<seq>&limit=<1-500>&verify=1` | tail of the signed journal; `verify=1` recomputes every sig + chain link |
| `GET /users` | account list (id, email, nickname, verified, createdAt, medalCount) |
| `GET /snapshots?userId=&game=&key=` | versioned save history (ts, dataHash, byte size, actor) |
| `POST /revert` `{"snapshotId":"sn_…"}` | restore that save version to the user's current save, then append an `admin.revert` audit entry |

Example:

```bash
KEY=$(printf '%s' "$MG_SIGNING_SECRET:owner" | sha256sum | cut -d' ' -f1)
curl -s -H "X-MG-Owner-Key: $KEY" \
     'https://minigames.xedryk.top/api/mg/admin/audit?verify=1&limit=5'
curl -s -H "X-MG-Owner-Key: $KEY" 'https://minigames.xedryk.top/api/mg/admin/snapshots'
curl -s -X POST -H "X-MG-Owner-Key: $KEY" -H 'Content-Type: application/json' \
     -d '{"snapshotId":"sn_…"}' 'https://minigames.xedryk.top/api/mg/admin/revert'
```

## 10. Security notes
- Passwords: scrypt, per-user salt, constant-time verify. Never logged.
- Live session tokens never stored — only SHA-256 digests (DB leak ≠ usable tokens).
- Auth + password/reset actions: per-IP rate limiting.
- Reset-request never discloses whether an account exists.
- Saves/stats/medals endpoints require a valid non-expired session.
- `MG_SIGNING_SECRET` leakage weakens the envelope only; the token checks on
  state changes remain the actual account boundary.
- Outbound email is capped at 30/hour globally (in-memory sentinel) — the
  backstop against IP-rotating abuse of the shared Gmail account. Over-limit
  signups/reset-requests get `429` and an audit entry (`system.mail_limit_hit`).
- `X-Forwarded-For` uses the **rightmost** entry (nginx appends the real client;
  leftmost entries are client-supplied and spoofable). Changing this would let
  attackers rotate past the per-IP rate limits.
- API responses set `Content-Security-Policy: default-src 'none'`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`; nginx adds
  `Referrer-Policy: no-referrer` + `nosniff` to static pages so email codes in
  the `account.html?...code=…` URL never leak through the Referer header.
- Emails deliver the code only — deliberately no clickable button URL, so there
  is never any ambiguity between the hub host (minigames.xedryk.top) and the
  GitHub Pages copy (mwolfinspace.github.io). The code is entered in the game's
  own login modal (verify / reset steps). `account.html` (served on both hosts)
  remains as a manual code-entry fallback and loads no third-party resources.

## 11. Future / notes
- The JSON store is intentionally swappable for Postgres by keeping the
  collection interface (`find/filter/update/all`).
- GitHub deploy policy: existing pages are untouched; new games ship with
  `minigames-client.js` included so the **same html runs full-featured everywhere**
  — on the minigames host, on the GitHub copy (which calls the Hub remotely), and
  "basic/offline" only when the Hub is unreachable. Zero branching in game code.
- Live/deploy keys are managed on the Gitea host (they are **not** committed).