// Text-to-speech: personal Kokoro service (tts.xedryk.top) with a
// browser speechSynthesis fallback for offline use. English only.
window.WG = window.WG || {};
(function () {
  let currentAudio = null;
  let browserVoice = null;

  function serviceUrl(text) {
    const c = WG_CONFIG.tts;
    return c.url
      .replace("{text}", encodeURIComponent(text))
      .replace("{voice}", c.voice);
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

  function speakBrowser(text) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    u.rate = 0.9;
    u.pitch = 0.85;
    if (browserVoice) u.voice = browserVoice;
    speechSynthesis.speak(u);
  }

  function stop() {
    if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
    WG.$$(".speaker.speaking, .speaker.loading").forEach(b => b.classList.remove("speaking", "loading"));
  }

  WG.tts = {
    speak(text, btn) {
      if (!text) return;
      stop();
      const c = WG_CONFIG.tts;
      const online = navigator.onLine !== false;

      const pulse = cls => {
        WG.$$(".speaker.speaking, .speaker.loading").forEach(b => b.classList.remove("speaking", "loading"));
        if (btn) {
          btn.classList.add(cls);
          const clear = () => btn.classList.remove("speaking", "loading");
          if (cls === "loading") btn.addEventListener("animationend", clear, { once: true });
        }
      };

      if (c.enabled && online) {
        const a = new Audio();
        currentAudio = a;
        if (btn) btn.classList.add("loading");
        let settled = false;
        a.addEventListener("playing", () => {
          settled = true;
          if (btn) { btn.classList.remove("loading"); btn.classList.add("speaking"); }
        });
        a.addEventListener("ended", () => { if (btn) btn.classList.remove("speaking", "loading"); currentAudio = null; });
        a.addEventListener("error", () => {
          if (btn) btn.classList.remove("loading", "speaking");
          if (!settled && c.browserFallback) speakBrowser(text);
        });
        a.src = serviceUrl(text);
        a.play().catch(() => {
          if (btn) btn.classList.remove("loading");
          if (!settled && c.browserFallback) speakBrowser(text);
        });
      } else if (c.browserFallback) {
        if (btn) { btn.classList.add("speaking"); setTimeout(() => btn.classList.remove("speaking"), 1200); }
        speakBrowser(text);
      }
    },
    stop
  };
})();
