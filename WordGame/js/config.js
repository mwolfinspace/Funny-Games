// ═══════════════════════════════════════════════════════════════
//  Word Adventure — configuration (safe to edit by hand)
// ═══════════════════════════════════════════════════════════════
window.WG_CONFIG = {

  // ── Text-to-speech ──────────────────────────────────────────
  // Personal Kokoro TTS service. {text} and {voice} are replaced.
  // Male English voices on Kokoro: am_michael, am_adam, am_onyx,
  // am_puck, bm_daniel, bm_george, bm_fable
  tts: {
    enabled: true,
    url: "https://tts.xedryk.top/tts?text={text}&voice={voice}&speed=0.9",
    voice: "am_michael",
    // Fallback when offline / service down: built-in browser voice
    browserFallback: true
  },

  // ── Internet photos (safe search) ───────────────────────────
  // Openverse has mature=false filtering (always on).
  // Wikimedia Commons is the backup provider.
  images: {
    enabled: true,
    primary: "openverse",          // "openverse" | "commons"
    timeoutMs: 8000
  },

  // ── Gameplay defaults (welcome screen initial values) ───────
  defaults: {
    level: "prea1",                 // prea1 | a1 | a2 | challenge
    count: 10
  },

  // ── Sound effects ───────────────────────────────────────────
  sfx: true
};
