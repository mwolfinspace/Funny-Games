// Minigames Hub backend — account manager, device sessions, stats & medals.
// Serves all games hosted on minigames.xedryk.top. Same-origin requests from
// the hub host and cross-origin requests from the GitHub Pages copy both get
// full capabilities; other origins get an external (featureless) envelope.
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
const crypto = require("crypto");
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
const OWNER_EMAILS = new Set(
  (process.env.MG_OWNER_EMAIL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const SHA256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
// Owner API key (no account needed): sha256(MG_SIGNING_SECRET + ":owner")
const OWNER_KEY = SHA256(SIGNING_SECRET + ":owner");

// ── collections ─────────────────────────────────────────────────────────────
const users = collection("users");
const sessions = collection("sessions");
const deviceSaves = collection("device_saves");
const gameStats = collection("game_stats");
const medals = collection("medals");
const eventLog = collection("event_log");
const saveSnapshots = collection("save_snapshots");

const loginLimiter = new auth.RateLimiter(60_000, 10);
const signupLimiter = new auth.RateLimiter(60_000, 5);
const resetLimiter = new auth.RateLimiter(60_000, 3);
const apiLimiter = new auth.RateLimiter(1000, 240);

// ── outbound mail sentinel ──────────────────────────────────────────────────
// Hard cap on emails per rolling hour. Per-IP limits can be dodged by rotating
// IPs, so this is the backstop that stops the shared gmail account from being
// used as a spam cannon (signup/reset sends are the only outbound mail paths).
const MAIL_WINDOW_MS = 60 * 60 * 1000;
const MAIL_PER_WINDOW = 30;
let mailWindowStart = Date.now();
let mailSentInWindow = 0;

function canSendMail() {
  const now = Date.now();
  if (now - mailWindowStart >= MAIL_WINDOW_MS) {
    mailWindowStart = now;
    mailSentInWindow = 0;
  }
  if (mailSentInWindow >= MAIL_PER_WINDOW) return false;
  mailSentInWindow++;
  return true;
}

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
  if (!u || !u.codeHash || !code) return false;
  const want = auth.digestToken(String(code).trim().toUpperCase());
  return timingSafeEq(u.codeHash, want) && Date.now() < Date.parse(u.codeExpiresAt);
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
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
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
  // nginx appends the real client IP as the LAST X-Forwarded-For entry; the
  // leftmost entries are client-supplied and can be spoofed to rotate past
  // per-IP rate limits, so only the rightmost value is trusted.
  const parts = (req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : req.socket.remoteAddress || "unknown";
}

/** A session token may arrive via Authorization: Bearer, ?token=, or body. */
function getToken(req, q, body) {
  const b = req.headers.authorization || "";
  const m = b.match(/^Bearer\s+(.+)$/i);
  return (m && m[1]) || q.get("token") || (body && body.token) || "";
}

// ── capabilities envelope ───────────────────────────────────────────────────
function buildCapabilities(origin, host) {
  // Browsers omit the Origin header on same-origin requests, so a request whose
  // Host is the hub's own public site is implicitly first party.
  const hostname = (host || "").toLowerCase().split(":")[0];
  const isSameSite = hostname === new URL(PUBLIC_URL).hostname;
  const isGitea = origin ? ALLOWED_ORIGINS.has(origin) : isSameSite;
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

// ── signed audit journal + save snapshots ───────────────────────────────────
// Append-only, hash-chained, HMAC-signed record of every state change. Each
// entry signs (seq|ts|prevHash|action|dataHash) and stores its own sha256, so
// any tamper with an older entry breaks the chain and every later signature.
function stableJson(v) {
  return v == null ? "null" : JSON.stringify(v);
}

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function isOwner(u, ownerKey) {
  if (u && OWNER_EMAILS.has(u.email)) return true;
  return typeof ownerKey === "string" && ownerKey.length === 64 && timingSafeEq(ownerKey, OWNER_KEY);
}

async function logAudit(entry) {
  const all = eventLog.all();
  const prev = all.length ? all[all.length - 1] : null;
  const seq = prev ? prev.seq + 1 : 1;
  const ts = nowIso();
  const payload = [seq, ts, prev ? prev.hash : "", entry.action, entry.dataHash || ""].join("|");
  const sig = auth.sign(SIGNING_SECRET, payload);
  const row = {
    seq,
    ts,
    prevHash: prev ? prev.hash : null,
    actor: entry.actor || null,
    action: entry.action,
    userId: entry.userId || null,
    game: entry.game || null,
    key: entry.key || null,
    dataHash: entry.dataHash || null,
    detail: entry.detail || null,
    sig,
    hash: SHA256(payload + "|" + sig),
  };
  await eventLog.update((rows) => rows.push(row));
  return row;
}

function auditVerify() {
  const all = eventLog.all();
  let firstBad = null;
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    const chainOk = i === 0 ? e.prevHash === null : e.prevHash === all[i - 1].hash;
    const payload = [e.seq, String(e.ts), String(e.prevHash || ""), String(e.action), String(e.dataHash || "")].join("|");
    const sigOk = e.sig === auth.sign(SIGNING_SECRET, payload);
    const hashOk = e.hash === SHA256(payload + "|" + e.sig);
    if (!(chainOk && sigOk && hashOk)) {
      firstBad = i;
      break;
    }
  }
  return { valid: firstBad === null, count: all.length, firstBad };
}

/** Commit a versioned snapshot of a save; keeps the newest 10 per save identity. */
async function commitSnapshot(userId, game, key, device, data, actor) {
  const snap = {
    id: uid("sn_"),
    ts: nowIso(),
    userId,
    game,
    key,
    device,
    dataHash: SHA256(stableJson(data)),
    data,
    actor,
  };
  await saveSnapshots.update((rows) => {
    rows.push(snap);
    const same = rows.filter((r) => r.userId === userId && r.game === game && r.key === key && r.device === device);
    if (same.length > 10) {
      same.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
      for (const old of same.slice(0, same.length - 10)) {
        const i = rows.indexOf(old);
        if (i >= 0) rows.splice(i, 1);
      }
    }
  });
  return snap.id;
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
      json(res, 200, buildCapabilities(origin, req.headers.host));
      return;
    }

    if (p === "/api/mg/mm/verify" && req.method === "POST") {
      const body = await readBody(req);
      json(res, 200, { ok: verifyEnvelopeSig(body.features, body.issuedAt, body.sig), mode: buildCapabilities(origin, req.headers.host).mode });
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
      if (!canSendMail()) {
        await logAudit({ actor: "system", action: "system.mail_limit_hit", detail: "signup" });
        return json(res, 429, { ok: false, error: "Too many verification emails were sent recently. Try again later." });
      }

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
      await logAudit({ actor: "system", action: "signup", userId: user.id, detail: user.email });
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
      await logAudit({ actor: u.id, action: "verify", userId: u.id });
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
      await logAudit({ actor: u.id, action: "login", userId: u.id, detail: (body.device || "web").slice(0, 64) });
      json(res, 200, { ok: true, token, expiresAt, user: publicUser(u) });
      return;
    }

    if (p === "/api/mg/auth/logout" && req.method === "POST") {
      const body = await readBody(req);
      let who = null;
      if (body.token) {
        const digest = auth.digestToken(body.token);
        const victim = sessions.find((s) => s.tokenDigest === digest);
        if (victim) who = victim.userId;
        await sessions.update((rows) => {
          for (let i = rows.length - 1; i >= 0; i--) {
            if (rows[i].tokenDigest === digest) rows.splice(i, 1);
          }
        });
      }
      await logAudit({ action: "logout", userId: who });
      json(res, 200, { ok: true });
      return;
    }

    if (p === "/api/mg/auth/reset-request" && req.method === "POST") {
      if (resetLimiter.hit(ip, "reset")) {
        json(res, 429, { ok: false, error: "Too many reset requests. Try again in a minute." });
        return;
      }
      if (!canSendMail()) {
        await logAudit({ action: "system.mail_limit_hit", detail: "reset-request" });
        json(res, 429, { ok: false, error: "Too many reset emails were sent recently. Try again later." });
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
      await logAudit({ action: "reset.request", userId: u.id });
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
      await logAudit({ actor: u.id, action: "reset.password", userId: u.id });
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

      // ── owner-only admin: signed audit trail, snapshots, revert ─────────
      if (p.startsWith("/api/mg/admin/")) {
        if (!isOwner(u, q.get("owner") || req.headers["x-mg-owner-key"] || "")) {
          return json(res, 403, { ok: false, error: "Owner only." });
        }
        if (p === "/api/mg/admin/audit" && req.method === "GET") {
          const after = Number(q.get("after") || 0);
          const limit = Math.min(Number(q.get("limit") || 200), 500);
          let entries = eventLog.filter((e) => e.seq > after);
          entries = entries.slice(Math.max(0, entries.length - limit));
          return json(res, 200, {
            ok: true,
            total: eventLog.all().length,
            verify: q.get("verify") === "1" ? auditVerify() : null,
            entries,
          });
        }
        if (p === "/api/mg/admin/users" && req.method === "GET") {
          return json(res, 200, {
            ok: true,
            users: users.all().map((x) => ({
              id: x.id,
              email: x.email,
              nickname: x.nickname || "",
              verified: !!x.verified,
              createdAt: x.createdAt,
              medalCount: medals.all().filter((m) => m.userId === x.id).length,
            })),
          });
        }
        if (p === "/api/mg/admin/snapshots" && req.method === "GET") {
          const filtUser = String(q.get("userId") || "");
          const filtGame = String(q.get("game") || "");
          const filtKey = String(q.get("key") || "");
          const rows = saveSnapshots
            .filter((s) => (!filtUser || s.userId === filtUser) && (!filtGame || s.game === filtGame) && (!filtKey || s.key === filtKey))
            .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
          return json(res, 200, {
            ok: true,
            snapshots: rows.map((s) => ({
              id: s.id,
              ts: s.ts,
              userId: s.userId,
              game: s.game,
              key: s.key,
              device: s.device,
              dataHash: s.dataHash,
              size: JSON.stringify(s.data ?? null).length,
              actor: s.actor,
            })),
          });
        }
        if (p === "/api/mg/admin/revert" && req.method === "POST") {
          const snap = saveSnapshots.find((s) => s.id === body.snapshotId);
          if (!snap) return json(res, 404, { ok: false, error: "No such snapshot." });
          const data = snap.data ?? null;
          await deviceSaves.update((rows) => {
            const idx = rows.findIndex((r) => r.userId === snap.userId && r.game === snap.game && r.key === snap.key && r.device === snap.device);
            if (idx >= 0) rows[idx] = { ...rows[idx], data, updatedAt: nowIso() };
            else rows.push({ userId: snap.userId, game: snap.game, key: snap.key, device: snap.device || "web", data, updatedAt: nowIso() });
          });
          await logAudit({
            actor: u ? u.id : null,
            action: "admin.revert",
            userId: snap.userId,
            game: snap.game,
            key: snap.key,
            dataHash: snap.dataHash,
            detail: `restored ${snap.id}`,
          });
          return json(res, 200, { ok: true, restored: snap.id, restoredTs: snap.ts });
        }
        return json(res, 404, { ok: false, error: "Unknown admin endpoint." });
      }

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
        await logAudit({ actor: u.id, action: "change.password", userId: u.id });
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
        const snapId = await commitSnapshot(u.id, game, key, device, data, u.id);
        await logAudit({
          actor: u.id,
          action: "save",
          userId: u.id,
          game,
          key,
          dataHash: SHA256(stableJson(data)),
          detail: `snapshot=${snapId}`,
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