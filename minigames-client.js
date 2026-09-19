// Minigames Hub — client library for games hosted on minigames.xedryk.top
// (also works from any static deploy, e.g. the GitHub Pages copy, which
// connects straight back to the Hub on our own server).
// Include BEFORE the game's own script:
//   <script src="minigames-client.js"></script>
//
// Features exposed as an async-ready global `MG`:
//   await MG.init()            -> resolves capabilities (host + features)
//   MG.isGitea                 -> true once the server confirms gitea mode
//   MG.has("accounts") etc.    -> feature gate helper
//   MG.account.*               -> signup / verify / login / logout / reset / me
//   MG.save.*                  -> per-account, per-device game saves
//   MG.stats.*                 -> play / win / score / playtime events
//   MG.medals.*                -> catalog + own medals
//   MG.chess.*                 -> server-side chess AI (move + ping)
//   MG.live.*                  -> real-time WebSocket push channel
//
// Security model:
//  - GitHub Pages is passive static hosting; every dynamic feature runs on OUR
//    server, and the GitHub copy simply calls it. The server only signs the
//    capabilities envelope for known origins (minigames host + GitHub pages +
//    MG_ALLOWED_ORIGINS), and the envelope is what unlocks the UI — it is a
//    convenience gate, NOT a security boundary (an Origin header is spoofable).
//  - Real account protection is password + email verification + the session
//    token; state-changing API calls require that token. Per-IP rate limits
//    dampen abuse.

"use strict";

(function (global) {
  const MG = { _init: null, features: [], mode: "external", account: {}, save: {}, stats: {}, medals: {} };

  const GITEA_HOSTS = new Set(["minigames.xedryk.top", "gitea.xedryk.top"]);
  // The Hub lives on OUR server, not on whatever host serves the page. On a
  // hub host we call it same-origin (`/api/mg`); on any static deployment
  // (e.g. the GitHub Pages copy) we call the remote Hub URL directly — the
  // page is passive but every dynamic feature (accounts, saves, medals) runs
  // on our server anyway, so the GitHub copy simply talks to it.
  const REMOTE_HUB = "https://minigames.xedryk.top/api/mg";

  function pickApiBase() {
    if (!global.location) return REMOTE_HUB;
    const qHub = new URLSearchParams(global.location.search).get("hub");
    if (qHub) return qHub.replace(/\/+$/, "") + "/api/mg";
    if (GITEA_HOSTS.has(global.location.host)) return global.location.origin + "/api/mg";
    return REMOTE_HUB;
  }
  const API_BASE = pickApiBase();
  const SES = "mg_session_token";
  const SEY = "mg_session_expiry";
  const DEV = "mg_device_id";

  MG.isGitea = GITEA_HOSTS.has(global.location ? global.location.host : "");

  async function http(method, path, body) {
    const res = await fetch(API_BASE + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const e = new Error((data && data.error) || `Request failed (${res.status})`);
      e.status = res.status; e.data = data;
      throw e;
    }
    return data;
  }

  function getDeviceId() {
    let id = global.localStorage.getItem(DEV);
    if (!id) {
      id = "d_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { global.localStorage.setItem(DEV, id); } catch {}
    }
    return id;
  }

  // Session token is stored in localStorage (survives tab close / browser
  // restart) so the login persists for the full server-side session length
  // (90 days), like a normal website's "keep me signed in". The expiry is
  // kept alongside so stale tokens are dropped instead of throwing 401s.
  function getToken() {
    try {
      const exp = global.localStorage.getItem(SEY);
      if (exp && Date.now() >= Date.parse(exp)) {
        removeSession();
        return "";
      }
      return global.localStorage.getItem(SES) || "";
    } catch {}
    try { return global.sessionStorage.getItem(SES) || ""; } catch { return ""; }
  }
  function setToken(t, expiresAt) {
    try {
      if (t) global.localStorage.setItem(SES, t);
      else global.localStorage.removeItem(SES);
      if (expiresAt) global.localStorage.setItem(SEY, expiresAt);
      else global.localStorage.removeItem(SEY);
    } catch {
      // localStorage unavailable → fall back to sessionStorage
      try {
        if (t) global.sessionStorage.setItem(SES, t);
        else global.sessionStorage.removeItem(SES);
      } catch {}
    }
  }
  function removeSession() {
    try { global.localStorage.removeItem(SES); } catch {}
    try { global.localStorage.removeItem(SEY); } catch {}
    try { global.sessionStorage.removeItem(SES); } catch {}
  }

  // ── capabilities ─────────────────────────────────────────────────────────
  MG.init = function init(opts) {
    if (this._init) return this._init;
    this._init = (async () => {
      try {
        const cap = await http("GET", "/capabilities");
        this.mode = cap.mode || (this.isGitea ? "gitea" : "external");
        this.isGitea = this.mode === "gitea"; // server-confirmed, not host-name guess
        this.features = Array.isArray(cap.features) ? cap.features : [];
        this.issuedAt = cap.issuedAt;
        if (opts && opts.verify !== false) {
          try {
            const v = await http("POST", "/mm/verify", {
              features: this.features, issuedAt: this.issuedAt, sig: cap.sig,
            });
            if (v.ok !== true) { this.features = []; this.mode = "external"; }
          } catch { /* verify unavailable -> keep envelope */ }
        }
      } catch {
        this.features = [];
        this.mode = "external";
      }
      return this;
    })();
    return this._init;
  };

  MG.has = function has(feature) {
    return this.features.includes(feature);
  };

  MG.ready = function ready(feature) {
    return Promise.resolve(this._init || this.init()).then(() => {
      if (feature) return this.has(feature);
      return this.mode === "gitea";
    });
  };

  // ── account ──────────────────────────────────────────────────────────────
  const account = MG.account;
  account.me = () => http("GET", `/auth/me?token=${encodeURIComponent(getToken())}`);
  account.login = async (email, password, device) => {
    const d = await http("POST", "/auth/login", { email, password, device: device || getDeviceId() });
    setToken(d.token, d.expiresAt);
    live.connect();
    return d;
  };
  account.logout = async () => {
    try { await http("POST", "/auth/logout", { token: getToken() }); } catch {}
    removeSession();
    live.close();
  };
  account.signup = (email, password, nickname) =>
    http("POST", "/auth/signup", { email, password, nickname });
  account.verify = (email, code) => http("POST", "/auth/verify", { email, code });
  account.forgot = (email) => http("POST", "/auth/reset-request", { email });
  account.reset = (email, code, password) =>
    http("POST", "/auth/reset-password", { email, code, password });
  account.changePassword = (oldPassword, newPassword) =>
    http("POST", "/auth/change-password", { token: getToken(), oldPassword, newPassword });
  account.token = getToken;

  // ── saves ────────────────────────────────────────────────────────────────
  const save = MG.save;
  save.put = (game, key, data, device) =>
    http("PUT", "/save", { token: getToken(), game, key, data, device: device || getDeviceId() });
  save.get = async (game, key, device) => {
    const d = await http("GET", `/save?token=${encodeURIComponent(getToken())}&game=${encodeURIComponent(game)}&key=${encodeURIComponent(key)}&device=${encodeURIComponent(device || getDeviceId())}`);
    return d.data;
  };
  // Lightweight change signal (no payload): { ok, revision, updatedAt }.
  // Poll this to detect a save made from another tab/device, then fetch the
  // full value with save.get only when revision has moved.
  save.meta = (game, key, device) =>
    http("GET", `/save?meta=1&token=${encodeURIComponent(getToken())}&game=${encodeURIComponent(game)}&key=${encodeURIComponent(key)}&device=${encodeURIComponent(device || getDeviceId())}`);
  save.list = (game) =>
    http("GET", `/saves?token=${encodeURIComponent(getToken())}${game ? "&game=" + encodeURIComponent(game) : ""}`);

  // ── stats ────────────────────────────────────────────────────────────────
  const stats = MG.stats;
  stats.event = (game, ev, value) =>
    http("POST", "/stats", { token: getToken(), game, event: ev, value });
  stats.me = () => http("GET", `/stats/me?token=${encodeURIComponent(getToken())}`);

  // ── medals ───────────────────────────────────────────────────────────────
  const medals = MG.medals;
  medals.catalog = () => http("GET", "/medals/catalog");
  medals.mine = () => http("GET", `/medals/mine?token=${encodeURIComponent(getToken())}`);

  // ── server-side chess AI ─────────────────────────────────────────────────
  // The game sends its FEN + level and the Hub runs Stockfish here and sends
  // the best move back — the client device does no heavy computation. The
  // bundled local engine remains an offline failsafe. Requires a login.
  const chess = (MG.chess = {});
  chess.move = (opts) =>
    http("POST", "/chess/move", Object.assign({ token: getToken() }, opts));
  chess.ping = () => http("GET", `/chess/ping?token=${encodeURIComponent(getToken())}`);

  // ── short game codes ("library tickets") ───────────────────────────────────
  // Games with long seeds (chess FEN, shape seed strings, …) store the seed
  // ONCE on the Hub and get back a super-short unique code (≤8 chars, unambig-
  // uous alphabet). Anyone holding the code can swap it for the original seed:
  //   const { code } = await MG.codes.mint("chess", "FEN-abc…");    // login req.
  //   const { seed } = await MG.codes.open("ABC2345");              // public
  // The code is like a ticket into the server library — never read without it.
  const codes = (MG.codes = {});
  codes.mint = (game, seed) =>
    http("POST", "/codes", { token: getToken(), game, seed });
  codes.open = (code) =>
    http("GET", `/codes/lookup?code=${encodeURIComponent(String(code).trim())}`);

  // ── live (WebSocket) ──────────────────────────────────────────────────────
  // Real-time push channel to the Hub (/api/mg/ws, token-authenticated).
  // Games subscribe with MG.live.on(fn); the Hub pushes e.g.
  // {type:"save:updated", game, key, device, revision} the instant a save
  // lands, so other tabs/devices update in milliseconds — no polling needed.
  // Future fast games can also send commands up the socket: MG.live.send(obj).
  let _liveSocket = null;
  let _liveRetry = 0;
  let _liveTimer = 0;
  let _liveHandlers = [];
  const live = (MG.live = {
    connected: false,
    url() {
      return API_BASE.replace(/^http/, "ws") + "/ws?token=" + encodeURIComponent(getToken());
    },
    on(fn) {
      if (typeof fn === "function" && !_liveHandlers.includes(fn)) _liveHandlers.push(fn);
    },
    off(fn) {
      _liveHandlers = _liveHandlers.filter((h) => h !== fn);
    },
    send(obj) {
      if (_liveSocket && _liveSocket.readyState === 1) {
        _liveSocket.send(typeof obj === "string" ? obj : JSON.stringify(obj));
      }
    },
    connect() {
      if (typeof global.WebSocket === "undefined") return;
      const token = getToken();
      if (!token) return;
      if (_liveSocket && (_liveSocket.readyState === 0 || _liveSocket.readyState === 1)) return;
      try {
        const ws = new global.WebSocket(this.url());
        _liveSocket = ws;
        ws.onopen = () => {
          live.connected = true;
          _liveRetry = 0;
        };
        ws.onmessage = (ev) => {
          let d = null;
          try {
            d = JSON.parse(ev.data);
          } catch {}
          if (!d) return;
          for (const h of _liveHandlers) {
            try {
              h(d);
            } catch {}
          }
        };
        ws.onclose = () => {
          live.connected = false;
          _liveSocket = null;
          const delay = Math.min(1000 * Math.pow(2, _liveRetry++), 15000);
          _liveTimer = setTimeout(() => {
            if (getToken()) live.connect();
          }, delay);
        };
        ws.onerror = () => {
          try {
            ws.close();
          } catch {}
        };
      } catch {}
    },
    close() {
      if (_liveTimer) clearTimeout(_liveTimer);
      _liveTimer = 0;
      if (_liveSocket) {
        try {
          _liveSocket.onclose = null;
          _liveSocket.onmessage = null;
          _liveSocket.close();
        } catch {}
        _liveSocket = null;
      }
      live.connected = false;
    },
  });
  // Restored session: bring the live channel up right away.
  if (getToken()) setTimeout(() => { if (getToken()) live.connect(); }, 500);

  // ── dev/diagnostic ───────────────────────────────────────────────────────
  MG._diag = () => ({
    host: global.location.host,
    isGitea: MG.isGitea,
    mode: MG.mode,
    features: MG.features.slice(),
    deviceId: getDeviceId(),
    hasToken: !!getToken(),
    liveConnected: live.connected,
  });

  global.MG = MG;
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof window !== "undefined" ? window.MG : globalThis.MG);
}