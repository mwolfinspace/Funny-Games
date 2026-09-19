// Zero-dependency .env loader for the Minigames Hub backend.
//
// Loads KEY=VALUE pairs from backend/.env (same dir as this file) into
// process.env, but ONLY for keys that are not already set (explicit env /
// PM2 wins). Lines starting with # are comments; simple quotes around values
// are stripped. Copy backend/env.example -> backend/.env and fill it in.

"use strict";

const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, ".env");

try {
  const raw = fs.readFileSync(ENV_FILE, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const eq = t.indexOf("=");
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
} catch (e) {
  if (e.code !== "ENOENT") {
    console.warn(`[mg-env] could not read ${ENV_FILE}: ${e.message}`);
  }
}