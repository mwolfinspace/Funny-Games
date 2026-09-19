// Minigames Hub — client library for games hosted on minigames.xedryk.top.
// Include BEFORE the game's own script:
//   <script src="minigames-client.js"></script>
//
// Features exposed as an async-ready global `MG`:
//   await MG.init()            -> resolves capabilities (host + features)
//   MG.isGitea                 -> true only on the real Gitea host
//   MG.has("accounts") etc.    -> feature gate helper
//   MG.account.*               -> signup / verify / login / logout / reset / me
//   MG.save.*                  -> per-account, per-device game saves
//   MG.stats.*                 -> play / win / score / playtime events
//   MG.medals.*                -> catalog + own medals
//
// Security model:
//  - The GitHub pages deploy must never talk to the API. The server only signs
//    the capabilities envelope when the Origin is an allowed Gitea origin and
//    rejects state-changing requests from other origins, so even a modified
//    client cannot open real features on GitHub.
//  - The HMAC signature is verified against the server (`/api/mg/mm/verify`):
//    the client recomputes nothing itself, the server confirms the envelope.

"use strict";

(function (global) {
  const MG = { _init: null, features: [], mode: "external", account: {}, save: {}, stats: {}, medals: {} };

  const GITEA_HOSTS = new Set(["minigames.xedryk.top", "gitea.xedryk.top"]);
  const API_BASE = "https://gitea.xedryk.top/api/mg";
  const SES = "mg_session_token";
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

  function getToken() {
    try { return global.sessionStorage.getItem(SES) || ""; } catch { return ""; }
  }
  function setToken(t) {
    try {
      if (t) global.sessionStorage.setItem(SES, t);
      else global.sessionStorage.removeItem(SES);
    } catch {}
  }

  // ── capabilities ─────────────────────────────────────────────────────────
  MG.init = function init(opts) {
    if (this._init) return this._init;
    this._init = (async () => {
      try {
        const cap = await http("GET", "/capabilities");
        this.mode = cap.mode || (this.isGitea ? "gitea" : "external");
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
    setToken(d.token);
    return d;
  };
  account.logout = async () => {
    try { await http("POST", "/auth/logout", { token: getToken() }); } catch {}
    setToken("");
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

  // ── dev/diagnostic ───────────────────────────────────────────────────────
  MG._diag = () => ({
    host: global.location.host,
    isGitea: MG.isGitea,
    mode: MG.mode,
    features: MG.features.slice(),
    deviceId: getDeviceId(),
    hasToken: !!getToken(),
  });

  global.MG = MG;
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof window !== "undefined" ? window.MG : globalThis.MG);
}