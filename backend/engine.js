// backend/engine.js — Stockfish UCI engine manager for server-side chess AI.
//
// The heavy move computation runs on the Hub (our strongest node), so a weak
// client device just sends FEN + level and instantly receives the best UCI
// move back over the REST channel — no local CPU cost for the player.
//
// A single Stockfish process is reused behind a serialized queue (search is
// CPU-bound, so parallel requests would just thrash it). The process is
// restarted automatically on crash or hang. Clients keep their bundled
// Stockfish + minimax as an offline failsafe.
//
// Zero dependencies — spawns the engine found at the first existing path:
//   MG_STOCKFISH_PATH            (explicit override)
//   backend/engine/stockfish     (repo-copied static binary)
//   stockfish                    (system package, e.g. Debian /usr/games)

"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ENGINE_PATHS = [
  process.env.MG_STOCKFISH_PATH || "",
  path.join(__dirname, "engine", "stockfish"),
  path.join(__dirname, "stockfish"),
  "/usr/games/stockfish", // Debian package location
  "/usr/bin/stockfish",
  "stockfish",
].filter(Boolean);

// Mirrors the in-browser AI_LEVELS so server and local play feel identical.
const LEVELS = {
  1: { elo: 2300, contempt: 10, movetime: 400 },
  2: { elo: 2450, contempt: 20, movetime: 600 },
  3: { elo: 2550, contempt: 30, movetime: 800 },
  4: { elo: 2750, contempt: 40, movetime: 1000 },
};

const EXTRA_BUDGET = 10_000; // extra ms past movetime before we call it hung
const UCI_MOVE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

class Engine {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.version = "";
    this.buf = "";
    this.lastInfo = null;
    this.pending = null;
    this._boot = null;
    this._starting = null;
    this.chain = Promise.resolve();
  }

  _pickPath() {
    for (const p of ENGINE_PATHS) {
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {}
    }
    return ENGINE_PATHS[ENGINE_PATHS.length - 1];
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────
  ensureReady() {
    if (this.ready) return Promise.resolve(this);
    if (this._starting) return this._starting;
    this._starting = this._spawn().finally(() => {
      this._starting = null;
    });
    return this._starting;
  }

  _spawn() {
    const exe = this._pickPath();
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        this._kill();
        reject(new Error(`engine init timeout (${exe})`));
      }, 20_000);

      if (this.proc) {
        try {
          this.proc.kill("SIGKILL");
        } catch {}
      }
      try {
        this.proc = spawn(exe, [], {
          stdio: ["pipe", "pipe", "ignore"],
          env: { ...process.env, LC_ALL: "C" },
        });
      } catch (e) {
        clearTimeout(timer);
        reject(e);
        return;
      }
      this.proc.stdout.setEncoding("utf8");
      this.proc.stdout.on("data", (d) => this._feed(d));
      this.proc.once("exit", () => this._onExit());
      this.proc.once("error", () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          this._kill();
          reject(new Error("engine spawn failed"));
        }
      });

      this._boot = {
        resolve: () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          this.ready = true;
          this.buf = "";
          resolve(this);
        },
      };
      this._send("uci");
    });
  }

  _kill() {
    const p = this.proc;
    this.proc = null;
    this.ready = false;
    this.buf = "";
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending = null;
    }
    if (p) {
      try {
        p.kill("SIGKILL");
      } catch {}
    }
  }

  _onExit() {
    this.ready = false;
    this.proc = null;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      const p = this.pending;
      this.pending = null;
      p.reject(new Error("engine exited"));
    }
  }

  // ── protocol ──────────────────────────────────────────────────────────────
  _send(cmd) {
    if (this.proc && this.proc.stdin && !this.proc.stdin.destroyed) {
      try {
        this.proc.stdin.write(cmd + "\n");
      } catch {}
    }
  }

  _feed(data) {
    this.buf += data;
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (line) this._onLine(line);
    }
  }

  _onLine(line) {
    if (line.startsWith("info")) {
      this._parseInfo(line);
      return;
    }
    if (line.startsWith("id name")) {
      this.version = line.slice("id name".length).trim();
      return;
    }
    if (line.startsWith("bestmove")) {
      const move = (line.split(/\s+/)[1] || "").toLowerCase().replace(/\s/g, "");
      const info = this.lastInfo;
      this.lastInfo = null;
      if (this.pending) {
        clearTimeout(this.pending.timer);
        const p = this.pending;
        this.pending = null;
        p.resolve({ move, ...info });
      }
      return;
    }
    if (line === "uciok") {
      // engine handshake: uci -> (uciok) -> isready -> readyok
      if (this._boot) this._send("isready");
      return;
    }
    if (line === "readyok" && this._boot) {
      const b = this._boot;
      this._boot = null;
      b.resolve();
      return;
    }
  }

  _parseInfo(line) {
    const toks = line.split(/\s+/);
    const info = { depth: null, scoreCp: null, mate: null, pv: [] };
    for (let i = 1; i < toks.length; i++) {
      const t = toks[i];
      if (t === "depth") {
        info.depth = Number(toks[i + 1]) || null;
      } else if (t === "score") {
        if (toks[i + 1] === "cp") info.scoreCp = Number(toks[i + 2]);
        else if (toks[i + 1] === "mate") info.mate = Number(toks[i + 2]);
      } else if (t === "pv") {
        info.pv = toks.slice(i + 1);
        break;
      }
    }
    this.lastInfo = info;
  }

  // ── public API ────────────────────────────────────────────────────────────
  // Serialised: one search at a time. Returns (or rejects with) the best move.
  move({ fen, level, movetime }) {
    const cfg = LEVELS[level] || LEVELS[1];
    const mt = Math.max(100, Math.min(Number(movetime) || cfg.movetime, 3000));
    this.chain = this.chain
      .then(() => this._run({ fen, cfg, mt }))
      .catch((e) => {
        this._kill();
        throw e;
      });
    return this.chain;
  }

  _run({ fen, cfg, mt }) {
    if (!this.proc || !this.ready) {
      return Promise.reject(new Error("engine not ready"));
    }
    return new Promise((resolve, reject) => {
      this.lastInfo = null;
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          this.pending = null;
          reject(new Error("engine timeout"));
        }
      }, mt + EXTRA_BUDGET);
      this.pending = {
        timer,
        resolve: (r) => {
          if (done) return;
          if (!UCI_MOVE.test(r.move)) {
            done = true;
            this.pending = null;
            reject(new Error(`illegal engine move "${r.move}"`));
            return;
          }
          done = true;
          this.pending = null;
          resolve({
            move: r.move,
            depth: r.depth,
            scoreCp: r.scoreCp,
            mate: r.mate,
            pv: Array.isArray(r.pv) ? r.pv.slice(0, 12) : [],
            engine: this.version || "stockfish",
          });
        },
        reject: (e) => {
          if (!done) {
            done = true;
            this.pending = null;
            reject(e);
          }
        },
      };
      this._send("setoption name UCI_LimitStrength value true");
      this._send(`setoption name UCI_Elo value ${cfg.elo}`);
      this._send(`setoption name Contempt value ${cfg.contempt}`);
      this._send(`setoption name Threads value 1`);
      this._send(`setoption name Hash value 16`);
      this._send("ucinewgame");
      this._send(`position fen ${fen}`);
      this._send(`go movetime ${mt}`);
    });
  }
}

module.exports = { Engine, LEVELS };