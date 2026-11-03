// Boot + global wiring.
window.WG = window.WG || {};
(function () {
  // Five word fonts: one handwriting + four very common, visually distinct.
  const FONTS = [
    { key: "sans",  name: "Trebuchet" },
    { key: "hand",  name: "Handwriting" },
    { key: "serif", name: "Georgia" },
    { key: "mono",  name: "Courier" },
    { key: "wide",  name: "Verdana" }
  ];
  WG.FONTS = FONTS;

  WG.app = {
    fontIndex() { return WG.clamp((WG.store.settings.font | 0) || 0, 0, FONTS.length - 1); },
    fontName() { return FONTS[this.fontIndex()].name; },
    fontKey() { return FONTS[this.fontIndex()].key; },
    applyFont() { document.documentElement.dataset.font = this.fontKey(); },
    cycleFont() {
      WG.store.settings.font = (this.fontIndex() + 1) % FONTS.length;
      WG.store.saveSettings();
      this.applyFont();
    },

    toggleTheme() {
      const cur = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = cur;
      WG.store.settings.theme = cur;
      WG.store.saveSettings();
      if (WG.kb && WG.kb.syncTheme) WG.kb.syncTheme();
      WG.ui.renderTopbar();
    },

    // leaving learn/test via 🏠 — confirm if there is progress to lose
    confirmLeaveLearn(go) {
      const st = WG.engine.state;
      if ((st.screen === "learn" && st.visited.some(v => v)) || (st.screen === "test" && !st.review)) {
        WG.ui.modal({
          emoji: "🏠",
          title: "Back to setup?",
          body: "Your current game will be lost.",
          okText: "Yes, go home 🏠",
          onOk: go
        });
      } else go();
    },

    boot() {
      // theme + word font
      document.documentElement.dataset.theme = WG.store.settings.theme === "dark" ? "dark" : "light";
      this.applyFont();

      WG.ui.init();

      // global keys: arrows / page keys move between words, letters feed the
      // learn-phase typing practice (never when a real input has focus).
      document.addEventListener("keydown", e => {
        const st = WG.engine.state;
        if (st.screen !== "learn" && st.screen !== "test") return;
        if (document.getElementById("modal-root").children.length) return;
        const tag = (e.target && e.target.tagName) || "";
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag);

        if (e.key === "PageDown") { e.preventDefault(); WG.ui.nav(1); return; }
        if (e.key === "PageUp") { e.preventDefault(); WG.ui.nav(-1); return; }
        if (typing) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); WG.ui.nav(-1); return; }
        if (e.key === "ArrowRight") { e.preventDefault(); WG.ui.nav(1); return; }

        if (st.screen === "learn" && e.key === "Enter") { e.preventDefault(); WG.ui.nav(1); return; }

        if (st.screen === "learn" && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
          if (WG.ui.typeKey(e.key)) e.preventDefault();
        }
      });

      // pause TTS when leaving the page
      window.addEventListener("beforeunload", () => WG.tts.stop());

      // first paint
      WG.ui.show("welcome");

      // data sanity note in console (helps when editing data files)
      const D = window.WG_DATA || {};
      const n = k => (D[k] || []).length;
      console.info("Word Adventure data — Pre-A1:", n("PREA1"), "· A1:", n("A1"), "· A2:", n("A2"));
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => WG.app.boot());
  } else {
    WG.app.boot();
  }
})();
