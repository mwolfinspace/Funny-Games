// Persistent "collections" for the Minigames backend. Each named collection
// lives in backend-data/<name>.json behind its own Store instance.
// This is intentionally file-backed (zero dependencies); swap to Postgres/MySQL
// later by wrapping the same shape: { find, filter, update, all, persist }.

"use strict";

const path = require("path");
const { Store } = require("./store");

const DATA_DIR =
  process.env.MG_DATA_DIR || path.join(__dirname, "..", "backend-data");

const stores = {};

function collection(name, seed = []) {
  if (!stores[name]) {
    stores[name] = new Store(path.join(DATA_DIR, `${name}.json`), seed);
  }
  return stores[name];
}

function ensureDir() {
  const fs = require("fs");
  if (!require("fs").existsSync(DATA_DIR)) {
    require("fs").mkdirSync(DATA_DIR, { recursive: true });
  }
}

module.exports = { collection, DATA_DIR, ensureDir };