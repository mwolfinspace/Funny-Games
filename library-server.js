// Server-owned Pattern Library for pattern_ultimate.html
//
// The Gitea host runs this tiny Node service (no dependencies) so the puzzle
// library JSON is owned and written on the SERVER, not by every browser.
// That means:
//   - library edits make zero git commits
//   - the admin password is checked server-side only (never in client code)
//   - the JSON file is rewritten atomically, so unstable client connections
//     can never corrupt it
//
// Usage:
//   node library-server.js
//   (optionally set LIBRARY_FILE, LIB_PASSWORD / LIB_PASSWORD_HASH, PORT)
//
// Endpoints (all CORS-enabled for the Gitea hosts):
//   GET  /api/library                        -> { library: [...] }
//   POST /api/library/unlock {password}      -> { token }
//   POST /api/library/save    {token, seed}  -> { library }
//   POST /api/library/delete  {token, index} -> { library }
//   POST /api/library/sync    {token, library} -> { library }  (whole replace)

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 8787;
const LIBRARY_FILE = process.env.LIBRARY_FILE
  ? path.resolve(process.env.LIBRARY_FILE)
  : path.join(__dirname, "pattern_user_puzzle.json");

// Password is checked as a SHA-256 hash. Set LIB_PASSWORD (plain, hashed at
// boot) or LIB_PASSWORD_HASH (already a hex hash). Defaults to "keepitup".
const PASSWORD_HASH =
  process.env.LIB_PASSWORD_HASH ||
  (process.env.LIB_PASSWORD
    ? sha256(process.env.LIB_PASSWORD)
    : "87d9af7dc6a1cbbbdb6d4164f0758da139c5ccd8506487615f5ae8fa6b28d2b4"); // sha256("keepitup")

const ALLOWED_ORIGINS = ["https://minigames.xedryk.top", "https://gitea.xedryk.top"];
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h, memory only, gone on restart
const MAX_UNLOCK_TRIES = 5; // per IP per minute, stops brute-force

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

let library = [];
try {
  library = JSON.parse(fs.readFileSync(LIBRARY_FILE, "utf8"));
  if (!Array.isArray(library)) throw new Error("not an array");
} catch (e) {
  console.warn(
    `[library] could not read ${LIBRARY_FILE} (${e.message}); starting empty.`,
  );
  library = [];
}

function persistLibrary(lib) {
  const tmp = LIBRARY_FILE + ".tmp." + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(lib, null, 2), "utf8");
  fs.renameSync(tmp, LIBRARY_FILE); // atomic replace
}

const tokens = new Map(); // token -> expiry ms
const unlockAttempts = new Map(); // ip -> {count, windowStart}

function issueToken() {
  const token = crypto.randomBytes(24).toString("hex");
  tokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

function tokenValid(token) {
  if (!token || !tokens.has(token)) return false;
  if (Date.now() > tokens.get(token)) {
    tokens.delete(token);
    return false;
  }
  return true;
}

function unlockRateLimited(ip) {
  const now = Date.now();
  let a = unlockAttempts.get(ip);
  if (!a || now - a.windowStart > 60_000) {
    a = { count: 0, windowStart: now };
    unlockAttempts.set(ip, a);
  }
  a.count++;
  return a.count > MAX_UNLOCK_TRIES;
}

function json(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function badJson(res) {
  json(res, 400, { error: "Invalid JSON body." });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "*";
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const ip = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");

  if (pathname === "/api/library" && req.method === "GET") {
    json(res, 200, { library });
    return;
  }

  if (pathname === "/api/library/unlock" && req.method === "POST") {
    let body = null;
    try {
      body = await readBody(req);
    } catch (e) {
      badJson(res);
      return;
    }
    if (unlockRateLimited(ip)) {
      json(res, 429, { error: "Too many attempts. Try again in a minute." });
      return;
    }
    if (
      body &&
      typeof body.password === "string" &&
      sha256(body.password) === PASSWORD_HASH
    ) {
      const token = issueToken();
      unlockAttempts.delete(ip);
      json(res, 200, { token });
    } else {
      json(res, 401, { error: "Wrong password." });
    }
    return;
  }

  if (
    ["/api/library/save", "/api/library/delete", "/api/library/sync"].includes(
      pathname,
    ) &&
    req.method === "POST"
  ) {
    let body = null;
    try {
      body = await readBody(req);
    } catch (e) {
      badJson(res);
      return;
    }
    if (!body || !tokenValid(body.token)) {
      json(res, 401, { error: "Session expired. Enter the password again." });
      return;
    }

    let next;
    if (pathname === "/api/library/save") {
      const seed = typeof body.seed === "string" ? body.seed.trim() : "";
      if (!seed) {
        json(res, 400, { error: "Missing seed." });
        return;
      }
      if (library.includes(seed)) {
        json(res, 409, { error: "Puzzle already in library." });
        return;
      }
      next = library.concat(seed);
    } else if (pathname === "/api/library/delete") {
      const index = Number(body.index);
      if (!Number.isInteger(index) || index < 0 || index >= library.length) {
        json(res, 400, { error: "Bad index." });
        return;
      }
      next = library.slice(0, index).concat(library.slice(index + 1));
    } else {
      // sync: whole-library replace (the "commit" push)
      if (!Array.isArray(body.library) ||
          body.library.some((s) => typeof s !== "string")) {
        json(res, 400, { error: "Library must be an array of seeds." });
        return;
      }
      const seedLengthGuard = 5000;
      if (body.library.some((s) => s.length > seedLengthGuard)) {
        json(res, 400, { error: "Library contains an oversized seed." });
        return;
      }
      next = body.library;
    }

    try {
      library = next.slice(); // keep guards: launch-time copy, dedupe
      library = [...new Set(library)];
      persistLibrary(library);
      json(res, 200, { library });
    } catch (e) {
      json(res, 500, { error: "Write failed on server: " + e.message });
    }
    return;
  }

  json(res, 404, { error: "Not found." });
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 2_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

server.listen(PORT, () => {
  console.log(
    `[library] server owning ${LIBRARY_FILE} on http://0.0.0.0:${PORT}`,
  );
  console.log(`[library] GET  /api/library | POST /api/library/{unlock,save,delete,sync}`);
});