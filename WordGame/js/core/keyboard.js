// Virtual keyboard — the real keyboard.html board is cloned out of
// <template id="kb-tpl"> and wired here. Two modes:
//   · input mode — writes into a target <input> (test phase)
//   · char mode  — calls opts.onChar(ch) for every letter (learn practice)
window.WG = window.WG || {};
(function () {
  // Minimal board used only if the template is missing from the page.
  const FALLBACK = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m", { act: "back", label: "⌫" }],
    [{ act: "space", label: "space", flex: 4 }, "-", "'", { act: "enter", label: "↵" }]
  ];

  function buildFallback() {
    const board = WG.el("div", { class: "vkb" });
    FALLBACK.forEach(row => {
      const rowEl = WG.el("div", { class: "row" });
      row.forEach(item => {
        const k = typeof item === "string" ? { k: item } : item;
        const btn = WG.el("button", { type: "button", "aria-label": k.label || k.k || k.act }, [k.label || k.k || " "]);
        if (k.flex) btn.style.flex = String(k.flex);
        if (k.k) btn.dataset.k = k.k;
        if (k.act) btn.dataset.act = k.act;
        rowEl.append(btn);
      });
      board.append(rowEl);
    });
    return board;
  }

  WG.kb = {
    /**
     * mount(container, { target, onChar, onBack, onEnter, onPrev, onNext, enabled })
     */
    mount(container, opts) {
      container.innerHTML = "";
      container.className = "kb-wrap";

      const tpl = document.getElementById("kb-tpl");
      const board = (tpl && tpl.content && tpl.content.firstElementChild)
        ? tpl.content.firstElementChild.cloneNode(true)
        : buildFallback();
      container.append(board);

      const state = { enabled: opts.enabled !== false };
      const charMode = typeof opts.onChar === "function";
      const target = () => (typeof opts.target === "function" ? opts.target() : opts.target);

      const insert = (inp, ch) => {
        if (!inp) return;
        const s = inp.selectionStart, e = inp.selectionEnd;
        inp.value = inp.value.slice(0, s) + ch + inp.value.slice(e);
        inp.setSelectionRange(s + ch.length, s + ch.length);
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.focus();
      };

      const backspace = inp => {
        if (!inp) return;
        const s = inp.selectionStart, e = inp.selectionEnd;
        const at = s === e ? Math.max(0, s - 1) : s;
        inp.value = inp.value.slice(0, at) + inp.value.slice(e);
        inp.setSelectionRange(at, at);
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.focus();
      };

      const press = (k, act, btn) => {
        if (!state.enabled) return;
        btn.classList.add("hit");
        setTimeout(() => btn.classList.remove("hit"), 110);

        if (act === "prev") { if (opts.onPrev) opts.onPrev(); return; }
        if (act === "next") { if (opts.onNext) opts.onNext(); return; }

        if (act === "back") {
          if (charMode) { if (opts.onBack) opts.onBack(); }
          else backspace(target());
          return;
        }
        if (act === "enter") { if (opts.onEnter) opts.onEnter(); return; }
        if (act === "space") k = " ";

        if (k === undefined || k === null) { WG.sfx.play("key"); return; } // decorative key
        if (charMode) { opts.onChar(k); return; }

        WG.sfx.play("key");
        insert(target(), k);
      };

      board.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("pointerdown", ev => {
          ev.preventDefault();
          press(btn.dataset.k, btn.dataset.act, btn);
        });
      });

      return {
        setEnabled(v) {
          state.enabled = v;
          container.classList.toggle("vkb-off", !v);
        }
      };
    }
  };
})();
