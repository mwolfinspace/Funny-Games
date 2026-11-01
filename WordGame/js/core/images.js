// Internet photos with safe search (Openverse mature=false, primary;
// Wikimedia Commons fallback). Everything is cached; offline or
// failed lookups fall back to the word's emoji.
window.WG = window.WG || {};
(function () {
  function fetchTimeout(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || WG_CONFIG.images.timeoutMs || 8000);
    return fetch(url, { signal: ctrl.signal, mode: "cors" })
      .finally(() => clearTimeout(t));
  }

  async function openverse(q) {
    const url = "https://api.openverse.org/v1/images/" +
      "?q=" + encodeURIComponent(q) + "&page_size=20&mature=false&aspect_ratio=square-tall";
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

  async function fetchCandidates(word) {
    const q = searchQuery(word);
    const providers = WG_CONFIG.images.primary === "commons"
      ? [commons, openverse] : [openverse, commons];
    let all = [];
    for (const prov of providers) {
      try {
        const urls = await prov(q);
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

