// Persisted settings + per-word flags.
window.WG = window.WG || {};
(function () {
  const DEFAULT_HINTS = {
    voice: true,   // 🔊 speak the word
    letters: true, // 🔤 letter count / blanks
    vn: true,      // 🇻🇳 Vietnamese meaning
    en: true,      // 📖 English meaning
    ex: true,      // ✏️ example sentence
    pos: true,     // 🔠 part of speech
    photo: false   // 🖼️ photo panel (off by default: text card is the default)
  };

  const DEFAULTS = {
    level: (window.WG_CONFIG && WG_CONFIG.defaults.level) || "prea1",
    count: (window.WG_CONFIG && WG_CONFIG.defaults.count) || 10,
    hints: Object.assign({}, DEFAULT_HINTS),
    theme: "light",
    font: 0,       // index into WG.FONTS
    sfx: window.WG_CONFIG ? WG_CONFIG.sfx !== false : true
  };

  function load() {
    const s = WG.storeGet("settings", null);
    const out = Object.assign({}, DEFAULTS, s || {});
    out.hints = Object.assign({}, DEFAULT_HINTS, (s && s.hints) || {});
    return out;
  }

  WG.store = {
    settings: load(),

    saveSettings() { WG.storeSet("settings", this.settings); },

    setHint(key, val) {
      this.settings.hints[key] = val;
      this.saveSettings();
    },

    // ── per-word photo flags ─────────────────────────────────
    isPhotoOff(w) {
      const f = WG.storeGet("photoOff", {});
      return !!f[this.k(w)];
    },
    setPhotoOff(w, off) {
      const f = WG.storeGet("photoOff", {});
      if (off) f[this.k(w)] = 1; else delete f[this.k(w)];
      WG.storeSet("photoOff", f);
    },
    isVerified(w) {
      const f = WG.storeGet("verified", {});
      return !!f[this.k(w)];
    },
    setVerified(w) {
      const f = WG.storeGet("verified", {});
      f[this.k(w)] = 1;
      WG.storeSet("verified", f);
    },

    // ── image URL cache (word -> url | 0 for "no result") ────
    cachedImage(w) {
      const c = WG.storeGet("imgCache", {});
      const v = c[this.k(w)];
      return v === undefined ? null : v;
    },
    cacheImage(w, url) {
      const c = WG.storeGet("imgCache", {});
      c[this.k(w)] = url || 0;
      // keep storage bounded: drop oldest entries beyond 600
      const keys = Object.keys(c);
      if (keys.length > 600) keys.slice(0, keys.length - 600).forEach(k => delete c[k]);
      WG.storeSet("imgCache", c);
    },

    k: w => String(w).toLowerCase()
  };
})();
