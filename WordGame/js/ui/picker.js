// Custom word list picker — search the dictionary, tick words, start a round.
window.WG = window.WG || {};
(function () {
  const LIMIT = 60;               // rows drawn per search
  const MAX_PICK = 200;           // matches the seed encoder

  // dictionary comes from WG.dict so seeds and searches share one order
  const dict = () => WG.dict.all();

  const low = v => String(v == null ? "" : v).toLowerCase().trim();
  const key = w => WG.norm(w);

  // Ranked search: exact word → starts with → contains → meaning match.
  // Anything not in the dictionary simply produces no row.
  function find(q) {
    const raw = low(q);
    if (!raw) return [];
    const qn = WG.norm(raw);
    const hits = [];
    dict().forEach(rec => {
      const w = rec.w.toLowerCase();
      let rank;
      if (w === raw) rank = 0;
      else if (w.startsWith(raw)) rank = 1;
      else if (qn && w.indexOf(qn) >= 0) rank = 2;
      else if (low(rec.vn).indexOf(raw) >= 0 || low(rec.en).indexOf(raw) >= 0) rank = 3;
      else return;
      hits.push({ rec, rank });
    });
    hits.sort((a, b) => a.rank - b.rank || a.rec.w.localeCompare(b.rec.w));
    return hits.slice(0, LIMIT).map(h => h.rec);
  }

  // ── popup state ─────────────────────────────────────────────
  let picked = [];
  let back = null;
  let snapshot = "";
  let inputEl, resultsEl, chipsEl, countEl, startEl, seedEl;

  const isPicked = rec => picked.some(p => key(p.w) === key(rec.w));

  function paintChips() {
    chipsEl.innerHTML = "";
    if (!picked.length) {
      chipsEl.append(WG.el("span", { class: "pk-none" }, [
        "Nothing picked yet — type above and tap a word."
      ]));
    }
    picked.forEach(rec => {
      chipsEl.append(WG.el("span", { class: "pk-chip" }, [
        WG.el("span", {}, [rec.w]),
        WG.el("button", {
          type: "button", class: "pk-x", title: "Remove " + rec.w,
          "aria-label": "Remove " + rec.w,
          onclick: () => {
            WG.sfx.play("back");
            picked = picked.filter(p => key(p.w) !== key(rec.w));
            paintChips();
            paintResults();
          }
        }, ["✕"])
      ]));
    });

    const n = picked.length;
    countEl.textContent = n + (n === 1 ? " word" : " words");
    startEl.disabled = n === 0;
    startEl.textContent = n
      ? "Start with " + n + (n === 1 ? " word" : " words") + " →"
      : "Pick at least one word";

    paintSeed(n);
  }

  // The seed id for the current list, tap to copy and keep for next time.
  function paintSeed(n) {
    seedEl.innerHTML = "";
    const code = n && n <= MAX_PICK ? WG.seed.encode(picked) : "";
    if (!code) return;
    seedEl.append(
      WG.el("span", { class: "pk-seed-label" }, ["🔗 Seed"]),
      WG.el("button", {
        type: "button", class: "pk-seed-code", title: "Copy seed id",
        "aria-label": "Copy seed id",
        onclick: e => copy(code, e.currentTarget)
      }, [code]),
      WG.el("span", { class: "pk-seed-hint" }, ["tap to copy"])
    );
  }

  function copy(text, el) {
    const done = () => {
      WG.sfx.play("correct");
      el.classList.add("copied");
      el.textContent = "Copied ✓";
      clearTimeout(el._t);
      el._t = setTimeout(() => {
        el.textContent = text;
        el.classList.remove("copied");
      }, 1300);
    };
    const fallback = () => {
      const ta = WG.el("textarea", { style: "position:fixed;top:0;left:0;opacity:0" });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) { /* ignore */ }
      ta.remove();
      done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }

  function paintResults() {
    const q = inputEl.value;
    resultsEl.innerHTML = "";
    resultsEl.scrollTop = 0;

    if (!low(q)) {
      resultsEl.append(WG.el("div", { class: "pk-empty" }, [
        "Start typing a word. Only words that already exist in the dictionary are listed."
      ]));
      return;
    }

    const rows = find(q);
    if (!rows.length) {
      resultsEl.append(WG.el("div", { class: "pk-empty" }, [
        "No match for “" + q.trim() + "”. ",
        WG.el("br"),
        "Try another spelling — words outside the dictionary can't be picked."
      ]));
      return;
    }

    rows.forEach(rec => {
      resultsEl.append(WG.el("button", {
        type: "button",
        class: "pk-row" + (isPicked(rec) ? " on" : ""),
        "aria-pressed": isPicked(rec) ? "true" : "false",
        onclick: e => {
          if (isPicked(rec)) {
            picked = picked.filter(p => key(p.w) !== key(rec.w));
            WG.sfx.play("back");
          } else {
            picked.push(rec);
            WG.sfx.play("correct");
          }
          const on = isPicked(rec);
          e.currentTarget.classList.toggle("on", on);
          e.currentTarget.setAttribute("aria-pressed", on ? "true" : "false");
          paintChips();
        }
      }, [
        WG.el("span", { class: "pk-tick", "aria-hidden": "true" }, ["✓"]),
        WG.el("span", { class: "pk-w" }, [rec.w]),
        WG.el("span", { class: "pk-pos" }, [rec.t || ""]),
        WG.el("span", { class: "pk-vn" }, [rec.vn || ""]),
        WG.el("span", { class: "pk-lv" }, [rec.lv])
      ]));
    });
  }

  function start() {
    if (!picked.length) return;
    WG.sfx.play("done");
    const s = WG.store.settings;
    WG.store.setCustomWords(picked);
    s.level = "custom";
    s.count = picked.length;
    WG.store.saveSettings();
    close(true);
    WG.engine.startRound("custom", picked.length);
    WG.ui.show("learn");
  }

  // Keep whatever the teacher picked (even without starting) so the setup
  // screen and a reload both still have it.
  function close(started) {
    if (!back) return;
    const b = back;
    back = null;
    b.classList.remove("in");
    document.removeEventListener("keydown", onKey, true);
    setTimeout(() => b.remove(), 200);
    if (started) return;

    const now = picked.map(r => key(r.w)).join("|");
    if (now === snapshot) return;

    WG.store.setCustomWords(picked);
    // a changed list becomes the selected mode, so the setup Start button
    // plays exactly what was just picked
    if (picked.length) {
      const s = WG.store.settings;
      s.level = "custom";
      s.count = picked.length;
      WG.store.saveSettings();
    }
    if (WG.engine.state.screen === "welcome") WG.ui.show("welcome");
  }

  function onKey(e) {
    if (e.key !== "Escape" || !back) return;
    e.preventDefault();
    close(false);
  }

  const picker = {
    open() {
      if (back) return;
      picked = WG.store.customWords().slice();
      snapshot = picked.map(r => key(r.w)).join("|");

      inputEl = WG.el("input", {
        class: "pk-search", type: "text", placeholder: "Type a word…",
        autocomplete: "off", autocorrect: "off", autocapitalize: "off",
        spellcheck: "false", "aria-label": "Search words"
      });
      resultsEl = WG.el("div", { class: "pk-results" });
      chipsEl = WG.el("div", { class: "pk-chips" });
      countEl = WG.el("b", { class: "pk-count" });
      seedEl = WG.el("div", { class: "pk-seed" });
      startEl = WG.el("button", {
        type: "button", class: "btn btn-primary pk-start", onclick: start
      });

      const box = WG.el("div", { class: "picker glass", role: "dialog", "aria-modal": "true", "aria-label": "Custom word list" }, [
        WG.el("div", { class: "pk-head" }, [
          WG.el("div", { class: "pk-head-txt" }, [
            WG.el("div", { class: "pk-title" }, ["✏️ Custom word list"]),
            WG.el("div", { class: "pk-sub" }, ["Search the dictionary and tick the words to practise."])
          ]),
          WG.el("button", {
            type: "button", class: "btn btn-ico pk-close", title: "Close",
            "aria-label": "Close", onclick: () => close(false)
          }, ["✕"])
        ]),
        inputEl,
        resultsEl,
        WG.el("div", { class: "pk-picked" }, [
          WG.el("div", { class: "pk-picked-head" }, [
            WG.el("span", { class: "pk-picked-label" }, ["Picked"]),
            countEl
          ]),
          chipsEl,
          seedEl
        ]),
        startEl
      ]);

      back = WG.el("div", { class: "picker-back" });
      back.append(box);
      back.addEventListener("click", e => { if (e.target === back) close(false); });
      document.body.append(back);
      document.addEventListener("keydown", onKey, true);

      inputEl.addEventListener("input", paintResults);
      paintChips();
      paintResults();

      requestAnimationFrame(() => {
        back.classList.add("in");
        setTimeout(() => inputEl.focus(), 120);
      });
    }
  };

  WG.picker = picker;
})();
