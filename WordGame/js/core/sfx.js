// Synthesised sound effects — zero assets, fully offline.
window.WG = window.WG || {};
(function () {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      // Base mix is 0.5; the config multiplier scales it (4 → 2.0 = 400%).
      const v = window.WG_CONFIG && WG_CONFIG.volumes;
      const mult = (v && typeof v.sfx === "number") ? v.sfx : 4;
      master.gain.value = 0.5 * mult;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }

  // Resume after a user gesture (browser autoplay policy).
  document.addEventListener("pointerdown", () => {
    if (!ctx && WG.store && !WG.store.settings.sfx) return;
    if (ensure() && ctx.state === "suspended") ctx.resume();
  }, { capture: true, passive: true });

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ensure() || !WG.store.settings.sfx) return;
    if (ctx.state === "suspended") ctx.resume();
    const t0 = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  const bank = {
    tap:     () => tone(640, 0.06, "triangle", 0.16),
    key:     () => tone(760, 0.035, "square", 0.05),
    toggle:  () => tone(520, 0.05, "sine", 0.15, 0, 700),
    next:    () => tone(420, 0.09, "sine", 0.14, 0, 680),
    back:    () => tone(620, 0.09, "sine", 0.12, 0, 380),
    correct: () => { tone(523.25, 0.1, "sine", 0.2); tone(783.99, 0.16, "sine", 0.2, 0.09); },
    wrong:   () => { tone(196, 0.16, "sawtooth", 0.12); tone(147, 0.2, "sawtooth", 0.1, 0.1); },
    flip:    () => tone(300, 0.05, "triangle", 0.1, 0, 420),
    done:    () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.14, "sine", 0.18, i * 0.09)),
    fanfare: () => [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 0.16, "triangle", 0.16, i * 0.1)),

    // typing practice: one bright "ting" per correct letter, rising with position
    ting: n => {
      const f = 880 * Math.pow(2, Math.min(n || 0, 10) / 12);
      tone(f, 0.09, "sine", 0.13);
      tone(f * 2, 0.05, "sine", 0.045);
    },
    // "beep beep" on a wrong letter
    beep: () => { tone(185, 0.09, "square", 0.09); tone(148, 0.11, "square", 0.09, 0.14); },
    // whole word typed correctly — small rising chime before it resets
    loop: () => [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => tone(f, 0.11, "sine", 0.15, i * 0.055))
  };

  WG.sfx = {
    play(name, arg) {
      const f = bank[name];
      if (f) try { f(arg); } catch (e) { /* ignore */ }
    }
  };
})();
