// Small helpers shared everywhere.
window.WG = window.WG || {};
(function () {
  WG.$ = (sel, root) => (root || document).querySelector(sel);
  WG.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // Escape text for HTML interpolation — ONLY for `html:` / innerHTML sinks.
  // Text passed to WG.el(...) children is appended as a text node and must
  // NOT be escaped here, otherwise apostrophes show up as "&#39;".
  WG.esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // Fisher–Yates shuffle (returns a copy).
  WG.shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Normalize an answer for checking: lowercase, keep a-z0-9 and
  // spaces only, collapse whitespace. "T-shirt!" ≡ "t shirt".
  WG.norm = s => String(s == null ? "" : s)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Letter-count hint: "ice cream" -> "3 + 5", "cat" -> "3"
  WG.letterCounts = w => w.trim().split(/\s+/).map(p => p.replace(/[^a-z0-9]/gi, "").length || 1).join(" + ");

  // Blank pattern hint: "ice cream" -> "___ _____"
  WG.blanks = w => w.trim().split(/\s+/)
    .map(p => "_".repeat(Math.max(2, p.replace(/[^a-z0-9]/gi, "").length || 2)))
    .join(" ");

  // Highlight the target word inside an example sentence.
  WG.highlight = (sentence, word) => {
    const s = WG.esc(sentence);
    const parts = word.split(/\s+/).map(WG.esc).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const alt = (word.a || []).map(w => WG.esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp("\\b(" + parts.concat(alt).join("|") + ")\\b", "gi");
    return s.replace(re, "<mark>$1</mark>");
  };

  // sessionStorage: settings survive F5 but reset when the tab is closed.
  // Never throws (file:// / private mode safe).
  const mem = {};
  const LS = (() => {
    try {
      const t = "__wg__";
      sessionStorage.setItem(t, "1");
      sessionStorage.removeItem(t);
      return sessionStorage;
    } catch (e) { return null; }
  })();
  WG.storeGet = (key, fallback) => {
    try {
      const v = LS && LS.getItem("wg:" + key);
      return v == null ? (key in mem ? mem[key] : fallback) : JSON.parse(v);
    } catch (e) { return key in mem ? mem[key] : fallback; }
  };
  WG.storeSet = (key, val) => {
    mem[key] = val;
    try { if (LS) LS.setItem("wg:" + key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  };

  // One-shot DOM builder: WG.el("button", {class:"btn", onclick: fn}, ["📋"])
  WG.el = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), attrs[k]);
      else if (k === "html") n.innerHTML = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(c => { if (c !== null && c !== undefined && c !== false) n.append(c); });
    return n;
  };

  WG.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
})();
