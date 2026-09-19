// Minigames Hub backend — account manager, device sessions, stats & medals.
// Servers all games hosted on minigames.xedryk.top. The GitHub pages version
// never talks to this API (features are hidden client-side unless the signed
// capabilities envelope verifies successfully, and capability signing is only
// issued for the known Gitea origin).
//
// Zero dependencies — run: node backend/server.js
//
// Env:
//   PORT               listen port (default 8907)
//   MG_DATA_DIR        data directory (default ./backend-data)
//   MG_PUBLIC_URL      site that hosts the games (default https://minigames.xedryk.top)
//   MG_SIGNING_SECRET  HMAC secret for the capabilities envelope (REQUIRED in prod)
//   MG_ALLOWED_ORIGINS comma-separated extra origins allowed to get full capabilities
//   SMTP_HOST          + SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM/SMTP_SECURE for mail

"use strict";

require("./env"); // load backend/.env first (only fills missing keys)

const http = require("http");
const { URL } = require("url");
const { collection, ensureDir } = require("./collections");
const auth = require("./auth");
const mail = require("./mail");
const { MEDALS, evaluateMedals, aggregate } = require("./medals");

ensureDir();

const PORT = Number(process.env.PORT) || 8907;
const PUBLIC_URL = process.env.MG_PUBLIC_URL || "https://minigames.xedryk.top";
const SIGNING_SECRET =
  process.env.MG_SIGNING_SECRET || "dev-signing-secret-change-me";
const GITEA_ORIGIN = "https://minigames.xedryk.top";
// The GitHub Pages copy (mwolfinspace.github.io) also talks to the Hub — it is
// passive static hosting, so all dynamic features run here. Add any further
// static deploys via MG_ALLOWED_ORIGINS.
const GITHUB_ORIGIN = "https://mwolfinspace.github.io";
const EXTRA_ORIGINS = (process.env.MG_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = new Set([GITEA_ORIGIN, GITHUB_ORIGIN, ...EXTRA_ORIGINS]);

// ── collections ─────────────────────────────────────────────────────────────
const users = collection("users");
const sessions = collection("sessions");
const deviceSaves = collection("device_saves");
const gameStats = collection("game_stats");
const medals = collection("medals");
const eventLog = collection("event_log");

const loginLimiter = new auth.RateLimiter(60_000, 10);
const signupLimiter = new auth.RateLimiter(60_000, 5);
const resetLimiter = new auth.RateLimiter(60_000, 3);
const apiLimiter = new auth.RateLimiter(1000, 240);

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const CODE_TTL_MS = 30 * 60 * 1000; // email codes valid 30 min

function uid(prefix = "") {
  return prefix + auth.digestToken(auth.newSessionToken()).slice(0, 24);
}

function nowIso() {
  return new Date().toISOString();
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    nickname: u.nickname || "",
    createdAt: u.createdAt,
    verified: !!u.verified,
    medalCount: (medals.filter((m) => m.userId === u.id)).length,
  };
}

function getUserByToken(token) {
  if (!token) return null;
  const digest = auth.digestToken(token);
  const s = sessions.find((x) => x.tokenDigest === digest);
  if (!s) return null;
  if (Date.now() - Date.parse(s.expiresAt) > 0) return null;
  return users.find((u) => u.id === s.userId) || null;
}

function validCode(u, code) {
  return !!u.codeHash && u.codeHash === auth.digestToken(String(code).toUpperCase()) && Date.now() < Date.parse(u.codeExpiresAt);
}

// ── JSON helpers ────────────────────────────────────────────────────────────
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, PUT, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  });
  res.end(body);
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function clientIp(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "unknown";
}

/** A session token may arrive via Authorization: Bearer, ?token=, or body. */
function getToken(req, q, body) {
  const b = req.headers.authorization || "";
  const m = b.match(/^Bearer\s+(.+)$/i);
  return (m && m[1]) || q.get("token") || (body && body.token) || "";
}

// ── capabilities envelope ───────────────────────────────────────────────────
function buildCapabilities(origin) {
  const isGitea = !!origin && ALLOWED_ORIGINS.has(origin);
  const features = isGitea
    ? ["accounts", "verify", "reset", "saves", "stats", "medals", "library", "sync"]
    : [];
  const payload = `${isGitea ? "gitea" : "guest"}|${features.join(":")}`;
  const envelope = {
    ok: true,
    host: "minigames.xedryk.top",
    mode: isGitea ? "gitea" : "external",
    features,
    issuedAt: nowIso(),
  };
  envelope.sig = auth.sign(SIGNING_SECRET, payload + "|" + envelope.issuedAt);
  return envelope;
}

function verifyEnvelopeSig(features, issuedAt, sig) {
  const mode = Array.isArray(features) && features.length ? "gitea" : "external";
  const payload = `${mode}|${(features || []).join(":")}`;
  const expected = auth.sign(SIGNING_SECRET, payload + "|" + issuedAt);
  return expected === sig;
}

// ── stats helpers ───────────────────────────────────────────────────────────
function bumpStats(userId, game, events) {
  return gameStats.update((rows) => {
    const row = rows.find((r) => r.userId === userId && r.game === game);
    const base = {
      userId,
      game,
      plays: 0,
      wins: 0,
      playtimeMs: 0,
      totalScore: 0,
      bestScore: 0,
      days: [],
      roundsByDay: {},
      updatedAt: nowIso(),
    };
    const cur = row || base;
    const day = nowIso().slice(0, 10);

    if (events.play) cur.plays = (cur.plays || 0) + events.play;
    if (events.win) cur.wins = (cur.wins || 0) + events.win;
    if (events.playtimeMs) cur.playtimeMs = (cur.playtimeMs || 0) + events.playtimeMs;
    if (events.score != null) {
      cur.totalScore = (cur.totalScore || 0) + events.score;
      cur.bestScore = Math.max(cur.bestScore || 0, events.score);
    }
    if (!cur.days.includes(day)) cur.days = [...cur.days, day].slice(-400);
    cur.roundsByDay = cur.roundsByDay || {};
    const n = (cur.roundsByDay[day] || 0) + (events.play || 1);
    cur.roundsByDay[day] = n;
    if (cur.roundsByDay && Object.keys(cur.roundsByDay).length > 400) {
      delete cur.roundsByDay[Object.keys(cur.roundsByDay)[0]];
    }
    cur.updatedAt = nowIso();

    if (!row) rows.push(cur);
  });
}

async function refreshMedals(userId) {
  const rows = gameStats.filter((r) => r.userId === userId);
  const agg = aggregate(rows);
  const earned = evaluateMedals(agg);
  const owned = medals.filter((m) => m.userId === userId).map((m) => m.medalId);
  const fresh = earned.filter((m) => !owned.includes(m));
  for (const medalId of fresh) {
    await medals.update((rows) => rows.push({ userId, medalId, awardedAt: nowIso() }));
  }
  return fresh;
}

function sendCodeEmail(user, { action, code, to }) {
  const isReset = action === "reset";
  const subject = isReset ? "Reset your Minigames password" : "Verify your Minigames email";
  return mail.sendMail({
    to: to || user.email,
    subject,
    heading: isReset ? "Reset your password" : "Confirm your email",
    summary:
      "We received a request on the Minigames Hub. Use the code below to continue — it expires in 30 minutes.",
    lines: [
      `Hello${user.nickname ? " " + user.nickname : ""}!`,
      isReset
        ? "Tap below (or enter the code) to choose a new password for your account."
        : "Tap below (or enter the code) to finish creating your account.",
    ],
    cta: code,
    ctaUrl: isReset
      ? `${PUBLIC_URL}/account.html?action=reset&email=${encodeURIComponent(user.email)}&code=${code}`
      : `${PUBLIC_URL}/account.html?action=verify&email=${encodeURIComponent(user.email)}&code=${code}`,
    footer: "The Minigames Hub — minigames.xedryk.top",
  });
}

// ── router ──────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const ip = clientIp(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, PUT, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://x.local`);
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const q = url.searchParams;

  if (apiLimiter.hit(ip, "api")) {
    json(res, 429, { ok: false, error: "Too many requests." });
    return;
  }

  try {
    // ── meta ─────────────────────────────────────────────────────────────
    if (p === "/api/mg/health" && req.method === "GET") {
      json(res, 200, { ok: true, service: "minigames-hub", time: nowIso() });
      return;
    }

    if (p === "/api/mg/capabilities" && req.method === "GET") {
      json(res, 200, buildCapabilities(origin));
      return;
    }

    if (p === "/api/mg/mm/verify" && req.method === "POST") {
      const body = await readBody(req);
      json(res, 200, { ok: verifyEnvelopeSig(body.features, body.issuedAt, body.sig), mode: buildCapabilities(origin).mode });
      return;
    }

    // ── account flow ─────────────────────────────────────────────────────
    if (p === "/api/mg/auth/signup" && req.method === "POST") {
      if (signupLimiter.hit(ip, "signup")) {
        json(res, 429, { ok: false, error: "Too many sign-ups. Try again in a minute." });
        return;
      }
      const body = await readBody(req);
      const email = auth.normalizeEmail(body.email);
      if (!auth.isEmail(email)) return json(res, 400, { ok: false, error: "Invalid email." });
      if (!auth.isStrongPassword(body.password))
        return json(res, 400, { ok: false, error: "Password must be at least 8 characters." });
      if (users.find((u) => u.email === email))
        return json(res, 409, { ok: false, error: "An account with that email already exists." });

      const code = auth.newCode();
      const user = {
        id: uid("u_"),
        email,
        nickname: (body.nickname || "").slice(0, 40),
        passwordHash: auth.hashPassword(body.password),
        verified: false,
        codeHash: auth.digestToken(code),
        codeExpiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        createdAt: nowIso(),
      };
      await users.update((rows) => rows.push(user));
      await sendCodeEmail(user, { action: "verify", code }).catch(() => {});
      json(res, 201, { ok: true, userId: user.id });
      return;
    }

    if (p === "/api/mg/auth/verify" && req.method === "POST") {
      const body = await readBody(req);
      const u = users.find((x) => x.email === auth.normalizeEmail(body.email));
      if (!u) return json(res, 404, { ok: false, error: "No such account." });
      if (!validCode(u, body.code)) return json(res, 400, { ok: false, error: "Code invalid or expired." });
      await users.update((rows) => {
        const t = rows.find((x) => x.id === u.id);
        t.verified = true;
        t.codeHash = "";
        t.codeExpiresAt = "";
      });
      await refreshMedals(u.id);
      json(res, 200, { ok: true, user: publicUser(u) });
      return;
    }

    if (p === "/api/mg/auth/login" && req.method === "POST") {
      if (loginLimiter.hit(ip, "login")) {
        json(res, 429, { ok: false, error: "Too many login attempts. Try again in a minute." });
        return;
      }
      const body = await readBody(req);
      const u = users.find((x) => x.email === auth.normalizeEmail(body.email));
      if (!u || !auth.verifyPassword(body.password || "", u.passwordHash)) {
        return json(res, 401, { ok: false, error: "Wrong email or password." });
      }
      const token = auth.newSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      await sessions.update((rows) => {
        rows.push({
          id: uid("s_"),
          tokenDigest: auth.digestToken(token),
          userId: u.id,
          device: (body.device || "web").slice(0, 64),
          createdAt: nowIso(),
          expiresAt,
        });
      });
      json(res, 200, { ok: true, token, expiresAt, user: publicUser(u) });
      return;
    }

    if (p === "/api/mg/auth/logout" && req.method === "POST") {
      const body = await readBody(req);
      if (body.token) {
        const digest = auth.digestToken(body.token);
        await sessions.update((rows) => {
          for (let i = rows.length - 1; i >= 0; i--) {
            if (rows[i].tokenDigest === digest) rows.splice(i, 1);
          }
        });
      }
      json(res, 200, { ok: true });
      return;
    }

    if (p === "/api/mg/auth/reset-request" && req.method === "POST") {
      if (resetLimiter.hit(ip, "reset")) {
        json(res, 429, { ok: false, error: "Too many reset requests. Try again in a minute." });
        return;
      }
      const body = await readBody(req);
      const u = users.find((x) => x.email === auth.normalizeEmail(body.email));
      // Do not reveal whether the account exists
      if (!u) return json(res, 200, { ok: true });
      const code = auth.newCode();
      await users.update((rows) => {
        const t = rows.find((x) => x.id === u.id);
        t.codeHash = auth.digestToken(code);
        t.codeExpiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
      });
      await sendCodeEmail(u, { action: "reset", code }).catch(() => {});
      json(res, 200, { ok: true });
      return;
    }

    if (p === "/api/mg/auth/reset-password" && req.method === "POST") {
      const body = await readBody(req);
      if (!auth.isStrongPassword(body.password))
        return json(res, 400, { ok: false, error: "Password must be at least 8 characters." });
      const u = users.find((x) => x.email === auth.normalizeEmail(body.email));
      if (!u || !validCode(u, body.code))
        return json(res, 400, { ok: false, error: "Code invalid or expired." });
      await users.update((rows) => {
        const t = rows.find((x) => x.id === u.id);
        t.passwordHash = auth.hashPassword(body.password);
        t.codeHash = "";
        t.codeExpiresAt = "";
      });
      json(res, 200, { ok: true });
      return;
    }

    if (p === "/api/mg/medals/catalog" && req.method === "GET") {
      json(res, 200, { ok: true, medals: MEDALS });
      return;
    }

    // ── authed endpoints (token in body/query/Authorization) ─────────────
    if (
      p.startsWith("/api/mg/") &&
      !["/api/mg/capabilities", "/api/mg/health", "/api/mg/mm/verify", "/api/mg/medals/catalog"].includes(p)
    ) {
      const body = await readBody(req);
      const u = getUserByToken(getToken(req, q, body));
      if (p === "/api/mg/auth/me") {
        if (!u) return json(res, 401, { ok: false, error: "Not logged in." });
        return json(res, 200, { ok: true, user: publicUser(u) });
      }
      if (p === "/api/mg/auth/change-password") {
        if (!u) return json(res, 401, { ok: false, error: "Not logged in." });
        if (!auth.verifyPassword(body.oldPassword || "", u.passwordHash))
          return json(res, 400, { ok: false, error: "Current password is wrong." });
        if (!auth.isStrongPassword(body.newPassword))
          return json(res, 400, { ok: false, error: "New password must be at least 8 characters." });
        await users.update((rows) => {
          const t = rows.find((x) => x.id === u.id);
          t.passwordHash = auth.hashPassword(body.newPassword);
        });
        return json(res, 200, { ok: true });
      }

      // ── device save (session per device) ───────────────────────────────
      if (p === "/api/mg/save" && req.method === "PUT") {
        if (!u) return json(res, 401, { ok: false, error: "Not logged in." });
        const game = String(body.game || "").replace(/[^a-z0-9_\-]/gi, "").slice(0, 48);
        const key = String(body.key || "default").slice(0, 64);
        if (!game) return json(res, 400, { ok: false, error: "Game id required." });
        const data = body.data == null ? null : body.data;
        const device = String(body.device || "").slice(0, 64) || "web";
        await deviceSaves.update((rows) => {
          const idx = rows.findIndex((r) => r.userId === u.id && r.game === game && r.key === key && r.device === device);
          if (idx >= 0) rows[idx] = { ...rows[idx], data, updatedAt: nowIso() };
          else rows.push({ userId: u.id, game, key, device, data, updatedAt: nowIso() });
        });
        json(res, 200, { ok: true });
        return;
      }

      if (p === "/api/mg/save" && req.method === "GET") {
        if (!u) return json(res, 401, { ok: false, error: "Not logged in." });
        const game = String(q.get("game") || "").slice(0, 48);
        const key = String(q.get("key") || "default").slice(0, 64);
        const device = String(q.get("device") || "").slice(0, 64) || "web";
        const row = deviceSaves.find((r) => r.userId === u.id && r.game === game && r.key === key && r.device === device);
        json(res, 200, { ok: true, data: row ? row.data : null, updatedAt: row ? row.updatedAt : null });
        return;
      }

      if (p === "/api/mg/saves" && req.method === "GET") {
        if (!u) return json(res, 401, { ok: false, error: "Not logged in." });
        const game = String(q.get("game") || "").slice(0, 48);
        const rows = deviceSaves.filter(
          (r) => r.userId === u.id && (!game || r.game === game),
        );
        const grouped = {};
        for (const r of rows) {
          grouped[r.game] = grouped[r.game] || {};
          grouped[r.game][r.key] = { data: r.data, device: r.device, updatedAt: r.updatedAt };
        }
        json(res, 200, { ok: true, games: grouped });
        return;
      }

      // ── stats ──────────────────────────────────────────────────────────
      if (p === "/api/mg/stats" && req.method === "POST") {
        if (!u) return json(res, 401, { ok: false, error: "Not logged in." });
        const game = String(body.game || "").replace(/[^a-z0-9_\-]/gi, "").slice(0, 48);
        const ev = String(body.event || "").slice(0, 24);
        const value = Number(body.value) || 0;
        const events = {};
        if (ev === "play") events.play = 1;
        else if (ev === "win") events.win = 1;
        else if (ev === "score") events.score = Math.max(0, value);
        else if (ev === "playtime") events.playtimeMs = Math.max(0, value);
        else return json(res, 400, { ok: false, error: "Unknown event." });
        await bumpStats(u.id, game || "unknown", events);
        const fresh = await refreshMedals(u.id);
        json(res, 200, { ok: true, newMedals: fresh });
        return;
      }

      if (p === "/api/mg/stats/me" && req.method === "GET") {
        if (!u) return json(res, 401, { ok: false, error: "Not logged in." });
        const rows = gameStats.filter((r) => r.userId === u.id);
        json(res, 200, { ok: true, aggregate: aggregate(rows), rows });
        return;
      }

      if (p === "/api/mg/medals/mine" && req.method === "GET") {
        if (!u) return json(res, 401, { ok: false, error: "Not logged in." });
        const owned = medals.filter((m) => m.userId === u.id);
        json(res, 200, { ok: true, medals: owned.map((m) => ({ id: m.medalId, awardedAt: m.awardedAt })) });
        return;
      }

      json(res, 404, { ok: false, error: "Not found." });
      return;
    }

    if (p.startsWith("/api/mg/")) {
      return json(res, 404, { ok: false, error: "Unknown endpoint." });
    }

    json(res, 404, { ok: false, error: "Not found." });
  } catch (e) {
    console.error("[mg] request error:", e);
    json(res, e.message === "Invalid JSON" || e.message === "Payload too large" ? 400 : 500, {
      ok: false,
      error: e.message || "Server error",
    });
  }
});

server.listen(PORT, () => {
  console.log(`[mg] Minigames Hub backend listening on :${PORT}`);
  console.log(`[mg] public URL ${PUBLIC_URL}`);
  console.log(`[mg] served origins: ${[...ALLOWED_ORIGINS].join(", ")}`);
});