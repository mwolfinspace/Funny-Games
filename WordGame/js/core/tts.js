// Text-to-speech: personal Kokoro service (tts.xedryk.top) with a
// browser speechSynthesis fallback for offline use. English only.
//
// Playback path: the WAV is fetched once, decoded into an AudioBuffer and
// played through the gain → limiter chain (see `graph()`). Using a decoded
// buffer (instead of an <audio> element wired into Web Audio) means the whole
// clip is always played: a media element can stop a fraction early on
// `ended` / a late decode error, which used to clip the last syllable
// ("take a photo" → "take a pho"). The element path is kept only as a fallback.
window.WG = window.WG || {};
(function () {
  let actx = null;
  let ttsGain = null;
  let ttsLimit = null;

  let currentBuffer = null;   // AudioBufferSourceNode (main path)
  let currentAudio = null;    // <audio> (fallback path)
  let currentSrc = null;      // MediaElementAudioSourceNode (fallback path)
  let browserVoice = null;

  // Every speak() bumps this; stale async work checks it and bails out.
  let playToken = 0;
  let inflight = null;        // AbortController of the current fetch

  // ── Loudness boost ──────────────────────────────────────────
  // HTMLMediaElement.volume is clamped to 1.0, so the spoken audio is
  // routed through a Web Audio gain node to go above 100%.
  function ttsMultiplier() {
    const v = window.WG_CONFIG && WG_CONFIG.volumes;
    return (v && typeof v.tts === "number") ? v.tts : 1.5;
  }

  function graph() {
    if (ttsGain) return actx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      ttsGain = actx.createGain();
      ttsGain.gain.value = ttsMultiplier();
      // Kokoro clips are already near full scale, so a plain gain above 1.0
      // pushes the peaks past 0 dBFS and the voice crackles. The compressor
      // is wired as a limiter: it catches those peaks instead of clipping.
      ttsLimit = actx.createDynamicsCompressor();
      ttsLimit.threshold.value = -2;
      ttsLimit.knee.value = 0;
      ttsLimit.ratio.value = 20;
      ttsLimit.attack.value = 0.002;
      ttsLimit.release.value = 0.15;
      ttsGain.connect(ttsLimit);
      ttsLimit.connect(actx.destination);
      return actx;
    } catch (e) { actx = null; ttsGain = null; ttsLimit = null; return null; }
  }

  // Unlock the context on the first user gesture (autoplay policy).
  document.addEventListener("pointerdown", () => {
    if (actx && actx.state === "suspended") actx.resume();
  }, { capture: true, passive: true });

  function serviceUrl(text, voice) {
    const c = WG_CONFIG.tts;
    return c.url
      .replace("{text}", encodeURIComponent(text))
      .replace("{voice}", voice);
  }

  // Kokoro swallows the last syllable when the phrase has no terminal
  // punctuation ("take a photo" → "take a pho"). A full stop makes it
  // finish the final word. Display text is never changed — only what we send.
  const TERMINAL = /[.!?…]["'”’)\]]*$/;
  function spoken(text) {
    const t = String(text).trim();
    return TERMINAL.test(t) ? t : t + ".";
  }

  // ── Voice rotation ──────────────────────────────────────────
  // Every click advances one step through WG_CONFIG.tts.voices, so the game
  // alternates Michael (man) → Bella (woman) → Michael → …
  let voiceStep = 0;
  function nextVoice() {
    const c = WG_CONFIG.tts;
    const list = (Array.isArray(c.voices) && c.voices.length) ? c.voices : [c.voice];
    const voice = list[voiceStep % list.length];
    voiceStep = (voiceStep + 1) % list.length;
    return voice;
  }

  function pickBrowserVoice() {
    if (!window.speechSynthesis) return null;
    const voices = speechSynthesis.getVoices().filter(v => /^en(-|_$)/i.test(v.lang) || v.lang === "en");
    if (!voices.length) return null;
    const maleRe = /(male|david|daniel|george|guy|james|alex|fred|ryan|junior|arthur)/i;
    return voices.find(v => maleRe.test(v.name)) || voices.find(v => /google uk english male/i.test(v.name)) || voices[0];
  }
  if (window.speechSynthesis) {
    browserVoice = pickBrowserVoice();
    speechSynthesis.addEventListener("voiceschanged", () => { browserVoice = pickBrowserVoice(); });
  }

  function speakBrowser(text, btn) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    if (btn) {
      btn.classList.remove("loading");
      btn.classList.add("speaking");
      setTimeout(() => btn.classList.remove("speaking"), 1200);
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    u.rate = 0.9;
    u.pitch = 0.85;
    // speechSynthesis volume cannot exceed 1.0 — already at maximum.
    u.volume = 1;
    if (browserVoice) u.voice = browserVoice;
    speechSynthesis.speak(u);
  }

  // ── Decoded-clip cache (small LRU: repeat clicks are instant) ──
  const CACHE_MAX = 24;
  const cache = new Map();      // "voice|text" → AudioBuffer

  function cacheGet(key) {
    const buf = cache.get(key);
    if (!buf) return null;
    cache.delete(key);
    cache.set(key, buf);        // move to the end = most recent
    return buf;
  }
  function cachePut(key, buf) {
    cache.set(key, buf);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }

  function decode(ctx, raw) {
    return new Promise((resolve, reject) => {
      let done = false;
      const ok = b => { if (!done) { done = true; resolve(b); } };
      const bad = e => { if (!done) { done = true; reject(e); } };
      try {
        const p = ctx.decodeAudioData(raw, ok, bad);
        if (p && typeof p.then === "function") p.then(ok, bad);
      } catch (e) { bad(e); }
    });
  }

  // ── Main path: decoded AudioBuffer → gain → speakers ────────
  async function playBuffer(text, btn, voice, token) {
    const ctx = graph();
    if (!ctx) return false;
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch (e) {} }

    const key = voice + "|" + text;
    let buf = cacheGet(key);

    if (!buf) {
      const ac = new AbortController();
      inflight = ac;
      let res;
      try {
        res = await fetch(serviceUrl(text, voice), { mode: "cors", signal: ac.signal });
      } finally {
        if (inflight === ac) inflight = null;
      }
      if (token !== playToken) return true;      // user clicked something else
      if (!res.ok) return false;
      const raw = await res.arrayBuffer();
      if (token !== playToken) return true;
      buf = await decode(ctx, raw);
      cachePut(key, buf);
    }
    if (token !== playToken) return true;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ttsGain);
    currentBuffer = src;
    src.onended = () => {
      const live = currentBuffer === src;   // false when stop() replaced it
      if (live) currentBuffer = null;
      try { src.disconnect(); } catch (e) {}
      if (live && btn) btn.classList.remove("speaking", "loading");
    };
    src.start(0);
    if (btn) { btn.classList.remove("loading"); btn.classList.add("speaking"); }
    return true;
  }

  // ── Fallback path: <audio> element (no Web Audio support) ───
  // Each <audio> element can only be wired into the graph once.
  // crossOrigin MUST be set before src, otherwise the element is treated as
  // opaque and the graph outputs silence (the "outputs zeroes due to CORS"
  // warning). The TTS service replies with `Access-Control-Allow-Origin: *`.
  function boost(a) {
    const ctx = graph();
    if (!ctx) return null;
    try {
      if (ctx.state === "suspended") ctx.resume();
      a.crossOrigin = "anonymous";
      const src = ctx.createMediaElementSource(a);
      src.connect(ttsGain);
      return src;
    } catch (e) { return null; }
  }

  function releaseSource(src) {
    if (src) { try { src.disconnect(); } catch (e) {} }
    if (currentSrc === src) currentSrc = null;
  }

  function playElement(text, btn, allowBoost, voice, token) {
    if (token !== playToken) return;
    const c = WG_CONFIG.tts;
    const a = new Audio();
    currentAudio = a;

    const src = allowBoost ? boost(a) : null;   // boost() also sets crossOrigin
    currentSrc = src;

    if (btn) btn.classList.add("loading");
    let settled = false, failed = false;

    const fail = () => {
      if (failed) return;
      failed = true;
      releaseSource(src);
      if (btn) btn.classList.remove("loading", "speaking");
      if (currentAudio === a) currentAudio = null;
      if (settled || token !== playToken) return;
      if (allowBoost) playElement(text, btn, false, voice, token);   // CORS refused → play plainly
      else if (c.browserFallback) speakBrowser(text, btn);           // still broken → browser voice
    };

    a.addEventListener("playing", () => {
      settled = true;
      if (btn) { btn.classList.remove("loading"); btn.classList.add("speaking"); }
    });
    // Wait a beat before tearing the node down: the graph can still hold the
    // final milliseconds of the clip when `ended` fires.
    a.addEventListener("ended", () => {
      setTimeout(() => releaseSource(src), 150);
      if (btn) btn.classList.remove("speaking", "loading");
      if (currentAudio === a) currentAudio = null;
    });
    a.addEventListener("error", fail);

    a.src = serviceUrl(text, voice);
    a.play().catch(fail);
  }

  function stop() {
    playToken++;
    if (inflight) { try { inflight.abort(); } catch (e) {} inflight = null; }
    if (currentBuffer) {
      try { currentBuffer.stop(); } catch (e) {}
      try { currentBuffer.disconnect(); } catch (e) {}
      currentBuffer = null;
    }
    if (currentSrc) { try { currentSrc.disconnect(); } catch (e) {} currentSrc = null; }
    if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
    WG.$$(".speaker.speaking, .speaker.loading").forEach(b => b.classList.remove("speaking", "loading"));
  }

  WG.tts = {
    speak(text, btn) {
      if (!text) return;
      stop();
      const c = WG_CONFIG.tts;
      const token = playToken;
      const voice = nextVoice();
      const body = spoken(text);

      if (!c.enabled || navigator.onLine === false) {
        if (c.browserFallback) speakBrowser(body, btn);
        return;
      }

      if (btn) btn.classList.add("loading");
      playBuffer(body, btn, voice, token)
        .catch(() => false)
        .then(ok => {
          if (token !== playToken || ok) return;
          playElement(body, btn, true, voice, token);   // no Web Audio / decode failed
        });
    },
    stop
  };
})();
