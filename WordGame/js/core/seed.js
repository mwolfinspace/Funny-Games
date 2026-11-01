// Canonical dictionary order + seed ids for custom word lists.
//
// A seed id is a self-contained, short code for a set of words: the set is
// ranked with the combinatorial number system (order-independent, no
// duplicates) and written in base 64. Nothing is stored on a server, so the
// same code always rebuilds the same list — as long as the word files below
// stay in the same order.
window.WG = window.WG || {};
(function () {
  const AB = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
  const MAX_N = 200;            // far more words than any lesson needs
  const MAX_CODE = 240;         // reject absurdly long pasted strings
  const TAG = { PREA1: "Pre-A1", A1: "A1", A2: "A2" };

  // ── dictionary, in index order ──────────────────────────────
  let RECS = null;
  let POS = null;

  function build() {
    if (RECS) return RECS;
    const D = window.WG_DATA || {};
    const seen = Object.create(null);
    RECS = [];
    POS = new Map();
    Object.keys(TAG).forEach(lv => {
      (D[lv] || []).forEach(rec => {
        const k = WG.norm(rec.w);
        if (!k || seen[k]) return;
        seen[k] = 1;
        POS.set(k, RECS.length);
        RECS.push(Object.assign({}, rec, { lv: TAG[lv] }));
      });
    });
    return RECS;
  }

  // ── maths ───────────────────────────────────────────────────
  const B = n => BigInt(n);

  // C(n, k) as a BigInt; built so every intermediate division is exact.
  function binom(n, k) {
    if (k < 0 || n < k) return 0n;
    let r = 1n;
    for (let j = 1; j <= k; j++) r = (r * B(n - k + j)) / B(j);
    return r;
  }

  // Order-independent checksum so a mistyped code is rejected instead of
  // silently loading a different list.
  function chk(ids) {
    let h = 7;
    for (let i = 0; i < ids.length; i++) h = (h * 131 + ids[i] + 1) % 4096;
    return h;
  }

  function toB64(v) {
    let s = "";
    while (v > 0n) { s = AB[Number(v % 64n)] + s; v /= 64n; }
    return s;
  }

  function fromB64(s) {
    let v = 0n;
    for (let i = 0; i < s.length; i++) {
      const d = AB.indexOf(s[i]);
      if (d < 0) return null;
      v = v * 64n + B(d);
    }
    return v;
  }

  // ── public ──────────────────────────────────────────────────
  function encode(words) {
    build();
    const ids = [];
    (words || []).forEach(w => {
      const i = POS.get(WG.norm(w && w.w !== undefined ? w.w : w));
      if (i !== undefined && ids.indexOf(i) < 0) ids.push(i);
    });
    ids.sort((a, b) => a - b);
    if (!ids.length || ids.length > MAX_N) return "";

    const M = RECS.length;
    // rank inside C(M, N), then offset by every smaller set size so the
    // length can be recovered from the number itself
    let rank = 0n;
    ids.forEach((id, k) => { rank += binom(id, k + 1); });

    let cum = 0n;
    for (let k = 0; k < ids.length; k++) cum += binom(M, k);

    return toB64((cum + rank) * 4096n + B(chk(ids)));
  }

  function decode(code) {
    build();
    const s = String(code == null ? "" : code).trim();
    if (!s || s.length > MAX_CODE) return null;

    const raw = fromB64(s);
    if (raw === null || raw <= 0n) return null;

    const sum = Number(raw % 4096n);
    let v = raw / 4096n;
    const M = RECS.length;

    // recover the set size, then the rank within it
    let cum = 0n;
    let n = 0;
    let rank = null;
    for (let k = 0; k <= MAX_N; k++) {
      const next = cum + binom(M, k);
      if (v < next) { n = k; rank = v - cum; break; }
      cum = next;
    }
    if (rank === null || n < 1 || n > M) return null;

    // unrank: largest index whose binomial still fits, then peel it off
    const ids = [];
    let r = rank;
    for (let k = n; k >= 1; k--) {
      let lo = k - 1;
      let hi = M - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (binom(mid, k) <= r) lo = mid; else hi = mid - 1;
      }
      ids.push(lo);
      r -= binom(lo, k);
    }
    if (r !== 0n) return null;
    ids.reverse();

    if (chk(ids) !== sum) return null;
    return { words: ids.map(i => RECS[i]), ids };
  }

  WG.dict = {
    all: () => build().slice(),
    size: () => build().length,
    indexOf: w => {
      build();
      const i = POS.get(WG.norm(w));
      return i === undefined ? -1 : i;
    }
  };

  WG.seed = {
    encode,
    decode,
    check: code => !!decode(code),
    words: code => { const d = decode(code); return d ? d.words : null; }
  };
})();
