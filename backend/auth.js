// Auth & security primitives for the Minigames backend.
// Passwords are hashed with scrypt + per-user random salt (Node built-in
// crypto — no bcrypt dependency). Session tokens are opaque 256-bit values;
// only their SHA-256 digest is stored server-side so a leaked DB cannot be
// replayed directly.

"use strict";

const crypto = require("crypto");

const SCRYPT_N = 16384; // cost — safe mid-range scrypt params
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const TOKEN_BYTES = 32;

/** Hash a plaintext password -> "scrypt$N$r$p$salt$hash". */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .scryptSync(String(password), salt, KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    })
    .toString("hex");
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

/** Verify a plaintext password against a stored scrypt$ string. */
function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, expected] = parts;
  try {
    const got = crypto
      .scryptSync(String(password), salt, KEYLEN, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
      })
      .toString("hex");
    // constant-time compare
    const a = Buffer.from(got, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

/** Generate a fresh opaque session token (returned to the client once). */
function newSessionToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

/** Digest stored server-side so the DB never holds live tokens. */
function digestToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/** Random short code for email verification / password reset. */
function newCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
  const out = crypto.randomBytes(len);
  let code = "";
  for (let i = 0; i < len; i++) code += alphabet[out[i] % alphabet.length];
  return code;
}

/** Normalize an email address for storage/lookup. */
function normalizeEmail(email) {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

/** Basic shape validation for an email. */
function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

/** Basic password policy check. */
function isStrongPassword(pw) {
  return typeof pw === "string" && pw.length >= 8;
}

/** Simple in-memory per-key rate limiter (e.g. per IP, per route). */
class RateLimiter {
  constructor(windowMs = 60_000, max = 20) {
    this.windowMs = windowMs;
    this.max = max;
    this.buckets = new Map();
    setInterval(() => this.gc(), windowMs * 2).unref();
  }

  _key(ip, route) {
    return `${ip}|${route}`;
  }

  hit(ip, route) {
    const key = this._key(ip, route);
    const now = Date.now();
    const b = this.buckets.get(key) || { count: 0, reset: now + this.windowMs };
    if (now > b.reset) {
      b.count = 0;
      b.reset = now + this.windowMs;
    }
    b.count++;
    this.buckets.set(key, b);
    return b.count > this.max;
  }

  gc() {
    const now = Date.now();
    for (const [k, b] of this.buckets) {
      if (now > b.reset) this.buckets.delete(k);
    }
  }
}

/** HMAC signature helper used for the signed capabilities envelope. */
function sign(secret, payloadString) {
  return crypto
    .createHmac("sha256", secret)
    .update(payloadString)
    .digest("hex");
}

module.exports = {
  hashPassword,
  verifyPassword,
  newSessionToken,
  digestToken,
  newCode,
  normalizeEmail,
  isEmail,
  isStrongPassword,
  RateLimiter,
  sign,
};