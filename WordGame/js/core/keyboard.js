// Virtual keyboard — fresh glass board (ported from virtual-keyboard.html).
// Builds a 5-row ANSI laptop layout at runtime; the board sizes itself from
// the viewport (see css/keyboard.css). Two modes, same API as before:
//   · input mode — writes into a target <input> (test phase)
//   · char mode  — calls opts.onChar(ch) for every letter (learn practice)
window.WG = window.WG || {};
(function () {
  "use strict";

  const SH = "!@#$%^&*()";
  const off = (c, u = 1) => ({ c, u, t: "off" });                        // disabled, blank key
  const sym = (c, lo, hi, u = 1) => ({ c, u, t: "ch", lo, hi });         // number / symbol key
  const abc = s => [...s].map(l => ({ c: "Key" + l.toUpperCase(), u: 1, t: "ch", lo: l, hi: l.toUpperCase(), abc: 1 }));
  const mod = (c, u, t, key, label) => ({ c, u, t, key, label });        // shift, caps, enter, backspace
  const arrow = (c, label) => ({ c, u: 1, t: "arrow", key: c, label });  // arrow keys
  const ICONS = '<svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/>' +
    '<path fill="none" d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9"/></svg>' +
    '<svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  // US ANSI laptop layout, 15u wide × 5u tall. Every row adds up to exactly 15u.
  const ROWS = [
    [sym("Backquote", "`", "~"), ...[..."1234567890"].map((d, i) => sym("Digit" + d, d, SH[i])),
      sym("Minus", "-", "_"), sym("Equal", "=", "+"), mod("Backspace", 2, "back", "Backspace", "backspace")],
    [off("Tab", 1.5), ...abc("qwertyuiop"), sym("BracketLeft", "[", "{"), sym("BracketRight", "]", "}"),
      sym("Backslash", "\\", "|", 1.5)],
    [mod("CapsLock", 1.75, "caps", "CapsLock", "caps"), ...abc("asdfghjkl"), sym("Semicolon", ";", ":"),
      sym("Quote", "'", '"'), mod("Enter", 2.25, "enter", "Enter", "enter")],
    // no right Shift: blank filler, then Up arrow sits directly above the Down arrow
    [mod("ShiftLeft", 2.25, "shift", "Shift", "shift"), ...abc("zxcvbnm"), sym("Comma", ",", "<"),
      sym("Period", ".", ">"), sym("Slash", "/", "?"), off("Blank", 0.75), arrow("ArrowUp", "\u2191"), off("Blank2")],
    [{ c: "Theme", u: 1.25, t: "theme" },   // bottom-left key = light/dark toggle
      off("MetaLeft", 1.25), off("AltLeft", 1.25), { c: "Space", u: 6.25, t: "ch", lo: " ", hi: " " },
      off("AltRight"), off("ControlRight"), arrow("ArrowLeft", "\u2190"), arrow("ArrowDown", "\u2193"), arrow("ArrowRight", "\u2192")]
  ];
  ROWS.forEach((row, r) => { let x = 0; row.forEach(k => { k.r = r; k.x = x; x += k.u; }); });
  const KEYS = ROWS.flat();
  const SHIFT = KEYS.find(k => k.t === "shift");
  const hue = k => k.t === "enter" ? 215 : Math.round((k.x + k.u / 2) / 15 * 320 + k.r * 28) % 360;   // rainbow across the board

  const KC = { Backspace: 8, Enter: 13, ShiftLeft: 16, CapsLock: 20, Space: 32, Semicolon: 186, Equal: 187,
    Comma: 188, Minus: 189, Period: 190, Slash: 191, Backquote: 192, BracketLeft: 219, Backslash: 220,
    BracketRight: 221, Quote: 222, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
  const kcode = c => c.startsWith("Key") ? c.charCodeAt(3) : c.startsWith("Digit") ? c.charCodeAt(5) : KC[c];
  const tag = (n, text, cls) => { const e = document.createElement(n); e.textContent = text; if (cls) e.className = cls; return e; };

  /**
   * VirtualKeyboard.mount(element, options)
   *   target   : <input> or <textarea> to type into (optional)
   *   dispatch : where keydown/keyup events go. Default: target, or document if no target. null = none.
   *   onKey    : callback({type, key, code, shift, caps}) for every keydown / keyup
   *   theme    : 'light' | 'dark' (default: follow the system; the bottom-left key toggles it)
   *   onTheme  : callback('light' | 'dark') when the theme changes
   * Returns { shift, caps, theme, destroy() }
   */
  function mount(root, opts = {}) {
    // target may be an element or a getter (the answer box is rebuilt per card)
    const getTarget = () => (typeof opts.target === "function" ? opts.target() : opts.target) || null;
    const st = { shift: false, caps: false };
    const down = new Map();            // pointerId -> { el, k, ch, timer }
    let hold = null, used = false;     // finger currently holding Shift

    root.classList.add("vkb");
    const mq = window.matchMedia("(prefers-color-scheme: light)");      // follow the system until the toggle is used
    let manual = opts.theme === "light" || opts.theme === "dark";
    const sys = () => mq.matches ? "light" : "dark";
    const setTheme = t => { root.dataset.theme = t; if (opts.onTheme) opts.onTheme(t); };
    const onSys = () => { if (!manual) setTheme(sys()); };
    mq.addEventListener("change", onSys);
    setTheme(manual ? opts.theme : sys());

    const board = document.createElement("div"); board.className = "board";
    const grid = document.createElement("div"); grid.className = "keys";
    const els = KEYS.map((k, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.tabIndex = -1; b.dataset.i = i; b.dataset.t = k.t; b.className = "k";
      b.style.gridColumn = "span " + k.u * 4;
      b.style.setProperty("--h", hue(k));
      if (k.t === "off") b.disabled = true;
      else if (k.t === "theme") { b.innerHTML = ICONS; b.title = "Light / dark mode"; b.setAttribute("aria-label", b.title); }
      else if (k.t === "ch") {
        if (k.abc) b.append(tag("span", k.lo));                       // letters start lower case
        else if (k.lo !== " ") b.append(tag("i", k.hi), tag("b", k.lo));
      } else b.append(tag("span", k.label));
      grid.append(b);
      return b;
    });
    board.append(grid); root.append(board);

    const render = () => {
      const up = st.shift !== st.caps;
      board.classList.toggle("s", st.shift);
      KEYS.forEach((k, i) => {
        if (k.abc) els[i].firstChild.textContent = up ? k.hi : k.lo;   // upper case only when caps or shift is on
        if (k.t === "shift") els[i].classList.toggle("on", st.shift);
        if (k.t === "caps") els[i].classList.toggle("on", st.caps);
      });
    };
    const charOf = k => k.t !== "ch" ? undefined : ((k.abc ? st.shift !== st.caps : st.shift) ? k.hi : k.lo);

    function send(type, k, rec, repeat) {
      const key = rec.ch ?? k.key, n = kcode(k.c);
      const ev = new KeyboardEvent(type, { key, code: k.c, shiftKey: st.shift, repeat: !!repeat, bubbles: true, cancelable: true });
      Object.defineProperties(ev, { keyCode: { value: n }, which: { value: n } });   // for games that read keyCode
      const to = opts.dispatch === undefined ? (getTarget() || document) : opts.dispatch;
      const ok = to ? to.dispatchEvent(ev) : true;                                   // false if a game called preventDefault
      if (opts.onKey) opts.onKey({ type, key, code: k.c, shift: st.shift, caps: st.caps });
      return ok;
    }
    function insert(k, ch) {
      const t = getTarget();
      if (!t) return;
      const s = t.selectionStart ?? t.value.length, e = t.selectionEnd ?? s;
      if (k.t === "arrow") {            // move the caret (up/down move by line, keeping the column)
        const v = t.value; let p;
        if (k.c === "ArrowLeft") p = s === e ? Math.max(0, s - 1) : s;
        else if (k.c === "ArrowRight") p = s === e ? Math.min(v.length, e + 1) : e;
        else {
          const ls = s ? v.lastIndexOf("\n", s - 1) + 1 : 0, col = s - ls;
          if (k.c === "ArrowUp") p = !ls ? 0 : Math.min((ls < 2 ? 0 : v.lastIndexOf("\n", ls - 2) + 1) + col, ls - 1);
          else { const nl = v.indexOf("\n", s), ne = nl < 0 ? -1 : v.indexOf("\n", nl + 1);
                 p = nl < 0 ? v.length : Math.min(nl + 1 + col, ne < 0 ? v.length : ne); }
        }
        t.setSelectionRange(p, p); t.focus(); return;
      }
      if (k.t === "back") { if (s === e && s === 0) { t.focus(); return; } t.setRangeText("", s === e ? s - 1 : s, e, "end"); }
      else if (ch !== undefined || (k.t === "enter" && t.tagName === "TEXTAREA")) t.setRangeText(ch ?? "\n", s, e, "end");
      else return;
      t.dispatchEvent(new Event("input", { bubbles: true }));
      t.focus();
    }
    function act(rec, repeat) {
      const ok = send("keydown", rec.k, rec, repeat);
      if (ok) insert(rec.k, rec.ch);
    }
    function setShift(v) {
      if (st.shift === v) return;
      st.shift = v; send(v ? "keydown" : "keyup", SHIFT, {}); render();
    }

    function onDown(e) {
      const el = e.target.closest(".k");
      if (!el || el.disabled) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      const k = KEYS[el.dataset.i], rec = { el, k, ch: charOf(k) };
      down.set(e.pointerId, rec); el.classList.add("down");
      el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");     // glow ring
      if (k.t === "theme") { manual = true; setTheme(root.dataset.theme === "light" ? "dark" : "light"); return; }
      if (k.t === "shift") {            // tap = latch for one key, hold + another finger = momentary
        if (st.shift) setShift(false); else { setShift(true); hold = e.pointerId; used = false; }
        return;
      }
      if (hold !== null) used = true;
      if (k.t === "caps") { st.caps = !st.caps; send("keydown", k, rec); render(); return; }
      act(rec);
      // key repeat only for typing keys — arrows / Enter must not skip words
      if (k.t === "ch" || k.t === "back") {
        rec.timer = setTimeout(() => { rec.timer = setInterval(() => act(rec, true), 45); }, 450);
      }
    }
    function onUp(e) {
      const rec = down.get(e.pointerId);
      if (!rec) return;
      down.delete(e.pointerId); rec.el.classList.remove("down");
      clearTimeout(rec.timer); clearInterval(rec.timer);
      if (rec.k.t === "theme") return;
      if (rec.k.t === "shift") { if (hold === e.pointerId) { hold = null; if (used) setShift(false); } return; }
      send("keyup", rec.k, rec);
      if (rec.k.t !== "caps" && hold === null) setShift(false);   // one-shot shift ends after a key
    }
    function onMove(e) {                // cursor-following light inside the hovered key
      const el = e.target.closest(".k");
      if (!el || el.disabled) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--x", (e.clientX - r.left) / r.width * 100 + "%");
      el.style.setProperty("--y", (e.clientY - r.top) / r.height * 100 + "%");
    }
    const stop = e => e.preventDefault();   // keep focus on the text field
    board.addEventListener("pointerdown", onDown);
    board.addEventListener("pointerup", onUp);
    board.addEventListener("pointercancel", onUp);
    board.addEventListener("pointermove", onMove);
    board.addEventListener("animationend", e => e.target.classList.remove("pop"));
    board.addEventListener("mousedown", stop);
    board.addEventListener("contextmenu", stop);

    return {
      get shift() { return st.shift; },
      get caps() { return st.caps; },
      get theme() { return root.dataset.theme; },
      set theme(t) { manual = true; setTheme(t); },
      destroy() {
        down.forEach(r => { clearTimeout(r.timer); clearInterval(r.timer); });
        mq.removeEventListener("change", onSys);
        delete root.dataset.theme;
        root.replaceChildren();
        root.classList.remove("vkb");
      }
    };
  }

  window.VirtualKeyboard = { mount };

  // ── game wrapper ────────────────────────────────────────────────────────
  WG.kb = {
    _ctl: null,

    /**
     * mount(container, { target, onChar, onBack, onEnter, onPrev, onNext, enabled })
     */
    mount(container, opts) {
      opts = opts || {};
      if (this._ctl) { try { this._ctl.destroy(); } catch (e) {} this._ctl = null; }

      container.innerHTML = "";
      container.className = "kb-wrap";

      const charMode = typeof opts.onChar === "function";
      const target = charMode ? null : (opts.target || null);
      const state = { enabled: opts.enabled !== false };

      const ctl = window.VirtualKeyboard.mount(container, {
        target,
        dispatch: null,                 // the game is driven through onKey / insert below
        theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
        onTheme: t => {
          if (document.documentElement.dataset.theme === t) return;
          document.documentElement.dataset.theme = t;
          if (WG.store) { WG.store.settings.theme = t; WG.store.saveSettings(); }
          if (WG.ui && WG.ui.renderTopbar) WG.ui.renderTopbar();
        },
        onKey: info => {
          if (!state.enabled || info.type !== "keydown") return;
          const key = info.key, code = info.code;
          if (key === "Shift" || key === "CapsLock") return;

          if (code === "ArrowLeft") { if (opts.onPrev) opts.onPrev(); return; }
          if (code === "ArrowRight") { if (opts.onNext) opts.onNext(); return; }
          if (key === "Enter") { if (opts.onEnter) opts.onEnter(); return; }
          if (key === "Backspace") {
            WG.sfx.play("key");
            if (charMode && opts.onBack) opts.onBack();
            return;
          }
          if (key === " " || (key && key.length === 1)) {
            WG.sfx.play("key");
            if (charMode && opts.onChar) opts.onChar(key);
          }
        }
      });

      this._ctl = ctl;
      return {
        setEnabled(v) {
          state.enabled = v;
          container.classList.toggle("vkb-off", !v);
        },
        destroy() {
          ctl.destroy();
          if (WG.kb._ctl === ctl) WG.kb._ctl = null;
        }
      };
    },

    // Keep a mounted keyboard in step with the topbar theme button.
    syncTheme() {
      const t = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      if (this._ctl) this._ctl.theme = t;
    }
  };
})();
