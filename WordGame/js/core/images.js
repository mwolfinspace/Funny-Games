// Internet photos (Unsplash primary — landscape orientation;
// Openverse + Wikimedia Commons fallback). Everything is cached;
// offline or failed lookups fall back to the word's emoji.
window.WG = window.WG || {};
(function () {
  function fetchTimeout(url, ms, opts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || WG_CONFIG.images.timeoutMs || 8000);
    return fetch(url, Object.assign({ signal: ctrl.signal, mode: "cors" }, opts))
      .finally(() => clearTimeout(t));
  }

  async function unsplash(q) {
    const key = WG_CONFIG.images.unsplashKey;
    if (!key) throw new Error("no unsplash key");
    const url = "https://api.unsplash.com/search/photos?query=" +
      encodeURIComponent(q) + "&orientation=landscape&per_page=20";
    const r = await fetchTimeout(url, null, { headers: { Authorization: "Client-ID " + key } });
    if (!r.ok) throw new Error("us " + r.status);
    const j = await r.json();
    const out = [];
    for (const x of (j.results || [])) {
      const u = (x.urls && (x.urls.regular || x.urls.full || x.urls.raw)) || "";
      if (u && !out.includes(u)) out.push(u);
    }
    if (!out.length) throw new Error("us empty");
    return out;
  }

  async function openverse(q) {
    const url = "https://api.openverse.org/v1/images/" +
      "?q=" + encodeURIComponent(q) + "&page_size=20&mature=false&aspect_ratio=wide";
    const r = await fetchTimeout(url);
    if (!r.ok) throw new Error("ov " + r.status);
    const j = await r.json();
    const list = (j.results || []).filter(x => (x.thumbnail || x.url));
    const out = [];
    for (const x of list) {
      const u = x.thumbnail && /jpe?g|png|webp/i.test(x.thumbnail || "") ? x.thumbnail : (x.url || x.thumbnail);
      if (u && !out.includes(u)) out.push(u);
    }
    if (!out.length) throw new Error("ov empty");
    return out;
  }

  async function commons(q) {
    const url = "https://commons.wikimedia.org/w/api.php" +
      "?action=query&format=json&origin=*" +
      "&generator=search&gsrnamespace=6&gsrlimit=20" +
      "&gsrsearch=" + encodeURIComponent(q + " filetype:bitmap") +
      "&prop=imageinfo&iiprop=url|mime&iiurlwidth=640";
    const r = await fetchTimeout(url);
    if (!r.ok) throw new Error("cm " + r.status);
    const j = await r.json();
    const pages = Object.values(j.query && j.query.pages || {});
    const out = [];
    for (const p of pages) {
      const ii = p.imageinfo && p.imageinfo[0];
      if (ii && ii.thumburl && /jpe?g|png/i.test(ii.mime || "") && !out.includes(ii.thumburl)) out.push(ii.thumburl);
    }
    if (!out.length) throw new Error("cm empty");
    return out;
  }

  function searchQuery(word) {
    return [word.w, word.vn, word.es].filter(Boolean).join(" ").trim();
  }

  const inflight = {};
  const cursor = {};

  // Rate-limit cooldown: when a provider returns 429, skip it for
  // this many ms before retrying (Unsplash free tier = 50 req/hour).
  const RATE_COOLDOWN = 60 * 60 * 1000;
  const rateLimited = {};

  function isRateLimited(name) {
    const until = rateLimited[name] || 0;
    if (until && Date.now() < until) return true;
    delete rateLimited[name];
    return false;
  }

  async function tryProvider(name, fn, q) {
    if (isRateLimited(name)) throw new Error(name + " rate-limited");
    try {
      return await fn(q);
    } catch (e) {
      // Detect HTTP 429 from the error message (fn throws "us 429" etc.)
      if (/\b429\b/.test(e.message)) rateLimited[name] = Date.now() + RATE_COOLDOWN;
      throw e;
    }
  }

  async function fetchCandidates(word) {
    const q = searchQuery(word);
    const primary = WG_CONFIG.images.primary;
    let providers;
    if (primary === "unsplash") providers = [["unsplash", unsplash], ["openverse", openverse], ["commons", commons]];
    else if (primary === "commons") providers = [["commons", commons], ["openverse", openverse], ["unsplash", unsplash]];
    else providers = [["openverse", openverse], ["unsplash", unsplash], ["commons", commons]];
    let all = [];
    for (const [name, fn] of providers) {
      try {
        const urls = await tryProvider(name, fn, q);
        for (const u of urls) if (!all.includes(u)) all.push(u);
      } catch (e) { /* try next provider */ }
    }
    return all;
  }
  WG.images = {
    get(word, idx) {
      const key = word.w.toLowerCase();
      if (idx === undefined) idx = 0;
      if (idx === 0) {
        const cached = WG.store.cachedImage(word.w);
        if (cached !== null) return Promise.resolve(cached || null);
      }
      if (key in inflight && idx === 0) return inflight[key];

      const p = (async () => {
        if (!WG_CONFIG.images.enabled) return null;
        if (navigator.onLine === false) return null;
        if (word.ni) return null;
        if (WG.store.isPhotoOff(word.w)) return null;

        const cands = await fetchCandidates(word);
        if (!cands.length) {
          WG.store.cacheImage(word.w, 0);
          return null;
        }
        const i = ((idx || 0) % cands.length + cands.length) % cands.length;
        const url = cands[i];
        WG.store.cacheImage(word.w, url);
        cursor[key] = i;
        return url;
      })();

      if (idx === 0) {
        inflight[key] = p.finally(() => { delete inflight[key]; });
      }
      return p;
    },

    next(word) {
      const key = word.w.toLowerCase();
      const cur = (cursor[key] || 0) + 1;
      return this.get(word, cur);
    },

    check(url) {
      return new Promise(res => {
        const img = new Image();
        let done = false;
        const finish = ok => { if (!done) { done = true; res(ok ? url : null); } };
        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        setTimeout(() => finish(false), 9000);
        img.referrerPolicy = "no-referrer";
        img.src = url;
      });
    }
  };
})();

