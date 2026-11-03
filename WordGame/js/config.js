// ═══════════════════════════════════════════════════════════════
//  Word Adventure — configuration (safe to edit by hand)
// ═══════════════════════════════════════════════════════════════
window.WG_CONFIG = {

  // ── Text-to-speech ──────────────────────────────────────────
  // Personal Kokoro TTS service. {text} and {voice} are replaced.
  // The game alternates through `voices` on every click:
  //   Michael (man) → Bella (woman) → Michael → …
  // Both ids are verified working on tts.xedryk.top.
  tts: {
    enabled: true,
    url: "https://tts.xedryk.top/tts?text={text}&voice={voice}&speed=0.9",
    voices: ["am_michael", "af_bella"],
    voice: "am_michael",            // used only if `voices` is empty
    // Fallback when offline / service down: built-in browser voice
    browserFallback: true
  },

  // ── Internet photos ─────────────────────────────────────────
  // Pexels is the primary provider (landscape orientation, high quality).
  // Openverse (mature=false) and Wikimedia Commons are fallbacks.
  // Get a free Pexels API key at https://www.pexels.com/api
  images: {
    enabled: true,
    primary: "pexels",            // "pexels" | "openverse" | "commons"
    pexelsKey: "",                // your Pexels API key
    timeoutMs: 8000
  },

  // ── Gameplay defaults (welcome screen initial values) ───────
  defaults: {
    level: "prea1",                 // prea1 | a1 | a2 | challenge
    count: 10
  },

  // ── Sound effects ───────────────────────────────────────────
  sfx: true,

  // ── Volume ─────────────────────────────────────────────────
  // Multipliers applied on top of the original mix levels.
  // 1 = unchanged · 3 = 300% · 4 = 400%
  // The TTS clips are already near full scale, so anything much above ~1.5
  // clips the peaks and the voice crackles. Keep tts low.
  volumes: {
    sfx: 4,                         // sound effects  (master 0.5 → 2.0)
    tts: 1.5                        // spoken words   (1.0 → 1.5, limiter-guarded)
  }
};
