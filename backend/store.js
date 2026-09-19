// Atomic, zero-dependency JSON-file store for the Minigames backend.
// Each store is one JSON file (an array). Writes go to a temp file and are
// renamed over the target so a crash / unstable connection never corrupts it.
// In copy-on-write fashion the in-memory array is swapped, never mutated via
// the persisted reference, which keeps a single writer model across requests.

"use strict";

const fs = require("fs");
const path = require("path");

class Store {
  /**
   * @param {string} file - absolute path to the .json backing file
   * @param {Array}  seed  - default contents if the file does not exist yet
   */
  constructor(file, seed = []) {
    this.file = file;
    this.seed = seed;
    this.data = null;
    this.writeQ = Promise.resolve();
    this._ensureDir();
    this.load();
  }

  _ensureDir() {
    const dir = path.dirname(this.file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      const parsed = JSON.parse(raw);
      this.data = Array.isArray(parsed) ? parsed : this.seed.slice();
    } catch (e) {
      this.data = this.seed.slice();
      this.persist(); // create the file on first run
    }
    return this.data;
  }

  // Returns a snapshot of the current contents.
  all() {
    return this.data.slice();
  }

  /** Persist a NEW array (copy-on-write). Always await to guarantee ordering. */
  async persist(nextArray) {
    if (nextArray && nextArray !== this.data) {
      this.data = nextArray.slice();
    }
    const snapshot = this.data.slice();
    const tmp = this.file + ".tmp." + process.pid;
    this.writeQ = this.writeQ.then(async () => {
      const json = JSON.stringify(snapshot, null, 2);
      fs.writeFileSync(tmp, json, "utf8"); // write full temp file
      fs.renameSync(tmp, this.file); // atomic replace
    });
    return this.writeQ;
  }

  /**
   * Mutate-style helpers: build the next array from a read-only view, then
   * persist once. The mutation callback receives a frozen snapshot (copy) so a
   * misbehaving callback can never corrupt the live copy.
   */
  async update(fn) {
    const next = this.data.slice();
    fn(next);
    return this.persist(next);
  }

  find(predicate) {
    return this.data.find(predicate);
  }

  filter(predicate) {
    return this.data.filter(predicate);
  }
}

module.exports = { Store };