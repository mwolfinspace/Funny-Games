// All screens: welcome / learn / test / result + topbar, modal, confetti.
window.WG = window.WG || {};
(function () {
  const S = () => WG.engine.state;
  const HINTS = [
    { key: "voice",   icon: "🔊", label: "Speak the word",     short: "Speak" },
    { key: "letters", icon: "🔤", label: "Letter count",       short: "Letters" },
    { key: "vn",      icon: "🇻🇳", label: "Vietnamese meaning", short: "Vietnamese" },
    { key: "en",      icon: "📖", label: "English meaning",    short: "English" },
    { key: "ex",      icon: "✏️", label: "Example sentence",   short: "Example" },
    { key: "pos",     icon: "🔠", label: "Word type",          short: "Word type" },
    { key: "photo",   icon: "🖼️", label: "Photo",              short: "Photo" }
  ];

  const ui = {
    topbar: null,
    root: null,
    // Hints used during the test phase. Kept in memory only so the choices
    // made on the setup screen survive the round.
    testHints: null,

    // Hints actually in force right now.
    hints() {
      return S().screen === "test" && this.testHints
        ? this.testHints
        : WG.store.settings.hints;
    },

    init() {
      this.topbar = WG.$("#topbar");
      this.root = WG.$("#screen");
    },

    // ═══════════════════════ screen switch ═══════════════════════
    show(name) {
      S().screen = name;
      this._pad = null;
      document.body.dataset.screen = name;
      this.renderTopbar();
      this.root.innerHTML = "";
      this.root.className = "screen screen-" + name;
      this["render" + name[0].toUpperCase() + name.slice(1)]();
      this.root.classList.add("screen-in");
      window.scrollTo(0, 0);
    },

    // ═══════════════════════ topbar ═══════════════════════
    renderTopbar() {
      const st = S();
      const mode = st.screen;
      const s = WG.store.settings;
      const tb = this.topbar;
      tb.innerHTML = "";

      const left = WG.el("div", { class: "tb-left" });
      if (mode !== "welcome") {
        left.append(WG.el("button", {
          class: "btn btn-ico", title: "Setup / Cài đặt", "aria-label": "Setup",
          onclick: () => { WG.sfx.play("tap"); WG.app.confirmLeaveLearn(() => ui.show("welcome")); }
        }, ["🏠"]));
      }
      left.append(WG.el("div", { class: "tb-brand" }, [
        WG.el("span", { class: "tb-logo" }, ["🧠"]),
        WG.el("span", { class: "tb-title" }, ["Word Adventure"])
      ]));
      tb.append(left);

      if (mode === "learn" || mode === "test") {
        const info = WG.engine.levelInfo(st.level);
        tb.append(WG.el("div", { class: "tb-chip level-chip" }, [
          WG.el("span", {}, [info.emoji]),
          WG.el("span", { class: "lvl-name" }, [info.name.replace(" — All levels", "")]),
          WG.el("span", { class: "tb-sep" }, ["·"]),
          WG.el("span", { class: "mono" }, [(st.idx + 1) + "/" + st.set.length])
        ]));
        if (st.review) tb.append(WG.el("div", { class: "tb-chip review-chip" }, ["👀 Review"]));
      }

      const right = WG.el("div", { class: "tb-right" });
      if (mode === "learn" || mode === "test") {
        const pills = WG.el("div", { class: "tb-pills" });
        HINTS.forEach(h => {
          const on = this.hints()[h.key] !== false;
          pills.append(WG.el("button", {
            class: "pill" + (on ? " on" : " off"),
            title: h.label,
            "aria-label": h.label,
            "aria-pressed": on ? "true" : "false",
            onclick: (e) => {
              const live = this.hints();
              const next = live[h.key] === false;
              live[h.key] = next;
              // only the setup screen writes the saved preference
              if (live === WG.store.settings.hints) WG.store.saveSettings();
              WG.sfx.play("toggle");
              e.currentTarget.classList.toggle("on", next);
              e.currentTarget.classList.toggle("off", !next);
              ui.applyHints();
            }
          }, [h.icon]));
        });
        right.append(pills);
      }

      // font loop: one button cycles the 5 word fonts
      right.append(WG.el("button", {
        class: "btn btn-ico btn-font", title: "Font: " + WG.app.fontName(),
        "aria-label": "Change font", "data-font": WG.app.fontKey(),
        onclick: e => {
          WG.app.cycleFont();
          WG.sfx.play("toggle");
          e.currentTarget.title = "Font: " + WG.app.fontName();
          e.currentTarget.dataset.font = WG.app.fontKey();
        }
      }, ["Aa"]));

      right.append(WG.el("button", {
        class: "btn btn-ico" + (s.sfx ? "" : " dimmed"), title: "Sound effects",
        onclick: e => {
          s.sfx = !s.sfx; WG.store.saveSettings();
          e.currentTarget.classList.toggle("dimmed", !s.sfx);
          WG.sfx.play("tap");
        }
      }, [s.sfx ? "🔔" : "🔕"]));

      right.append(WG.el("button", {
        class: "btn btn-ico", title: "Theme", "aria-label": "Theme",
        onclick: () => {
          WG.app.toggleTheme();
          WG.sfx.play("toggle");
        }
      }, [document.documentElement.dataset.theme === "dark" ? "🌙" : "☀️"]));

      tb.append(right);
    },

    // Show/hide card sections based on hint settings + phase
    applyHints() {
      const h = this.hints();
      WG.$$("[data-hint]", this.root).forEach(n => {
        const on = h[n.dataset.hint] !== false;
        n.classList.toggle("hint-hidden", !on);
      });
      // no photo → single centred column, bigger text
      const card = WG.$(".card", this.root);
      if (card) card.classList.toggle("solo", h.photo === false);
      // photo switched back on: load it for the card that is already open
      if (h.photo !== false && card && !WG.$(".photo-box", card)) {
        const w = S().set[S().idx];
        if (w) this.renderPhoto(w);
      }
    },

    // ═══════════════════════ welcome ═══════════════════════
    renderWelcome() {
      const s = WG.store.settings;
      // a saved custom level whose list is empty has nothing to play
      if (s.level === "custom" && !WG.store.customWords().length) {
        s.level = "prea1";
        WG.store.saveSettings();
      }
      const LEVEL_META = {
        prea1:     { tag: "PRE-A1", short: "Starters",  full: "Pre-A1 Starters",       desc: "First words, colours & animals",       color: "#1fae6e" },
        a1:        { tag: "A1",     short: "Movers",    full: "A1 Movers",             desc: "Everyday routines & short sentences",  color: "#5b7cfa" },
        a2:        { tag: "A2",     short: "Flyers",    full: "A2 Flyers",             desc: "Richer stories & bigger ideas",        color: "#8b5cf6" },
        challenge: { tag: "ALL",    short: "Challenge", full: "Challenge — all levels", desc: "A mix of every Cambridge level",       color: "#f59e0b" },
        custom:    { tag: "MY",     short: "Custom",    full: "Custom word list",      desc: "Your own picked words",                color: "#ec4899" }
      };
      const meta = key => LEVEL_META[key] || {
        tag: String(key).toUpperCase(), short: key, full: key, desc: "Practise this word pool", color: "#5b7cfa"
      };
      // a custom round always uses every picked word
      const maxCount = () => s.level === "custom"
        ? Math.max(1, WG.store.customWords().length)
        : Math.max(5, WG.engine.poolSize(s.level) || 40);

      const wrap = WG.el("div", { class: "welcome" });
      // middle area: everything you set up scrolls here, never the page
      const mid = WG.el("div", { class: "w-mid" });

      // ── hero ──
      const step = (icon, title, sub) => WG.el("li", {}, [
        WG.el("span", { class: "ws-ico", "aria-hidden": "true" }, [icon]),
        WG.el("span", { class: "ws-title" }, [title]),
        WG.el("span", { class: "ws-sub" }, [sub])
      ]);

      mid.append(WG.el("header", { class: "w-hero glass" }, [
        WG.el("div", { class: "w-hero-main" }, [
          WG.el("span", { class: "w-eyebrow" }, ["🧠 Cambridge YLE · Vocabulary"]),
          WG.el("h1", { class: "w-title" }, [
            "Learn English words ",
            WG.el("span", { class: "w-grad" }, ["the fun way"]),
            "."
          ])
        ]),
        WG.el("ol", { class: "w-steps", "aria-label": "How it works" }, [
          step("📚", "Learn", "Look, type & listen"),
          step("⌨️", "Practice", "Type each word"),
          step("🏆", "Win", "Beat your score")
        ])
      ]));

      const panelHead = (num, title, sub) => WG.el("div", { class: "w-panel-head" }, [
        WG.el("span", { class: "w-step" }, [num]),
        WG.el("div", { class: "w-panel-head-txt" }, [
          WG.el("h2", { class: "w-panel-title" }, [title]),
          WG.el("p", { class: "w-panel-sub" }, [sub])
        ])
      ]);

      const main = WG.el("div", { class: "w-main" });
      // right column: session length on top, hints below
      const col = WG.el("div", { class: "w-col" });

      // ── 1 · levels ──
      const levelsPanel = WG.el("section", { class: "w-panel w-levels glass" }, [
        panelHead("1", "Choose your level", "Pick the Cambridge level you want to practise.")
      ]);
      const grid = WG.el("div", { class: "lvl-grid" });
      Object.keys(WG.engine.LEVELS).forEach(key => {
        if (key === "custom") return; // built as its own banner below the grid
        const L = WG.engine.LEVELS[key];
        const M = meta(key);
        const size = WG.engine.poolSize(key);
        const card = WG.el("button", {
          type: "button",
          class: "lvl-card" + (s.level === key ? " sel" : ""),
          "aria-pressed": s.level === key ? "true" : "false",
          style: "--lvl:" + M.color,
          onclick: () => {
            WG.sfx.play("tap");
            s.level = key;
            WG.store.saveSettings();
            WG.$$(".lvl-card", grid).forEach(c => {
              const on = c === card;
              c.classList.toggle("sel", on);
              c.setAttribute("aria-pressed", on ? "true" : "false");
            });
            paintCount();
          }
        }, [
          WG.el("span", { class: "lvl-top" }, [
            WG.el("span", { class: "lvl-emoji", "aria-hidden": "true" }, [L.emoji]),
            WG.el("span", { class: "lvl-check", "aria-hidden": "true" }, ["✓"])
          ]),
          WG.el("span", { class: "lvl-key" }, [M.tag]),
          WG.el("span", { class: "lvl-name" }, [M.short]),
          WG.el("span", { class: "lvl-desc" }, [M.desc]),
          WG.el("span", { class: "lvl-size" }, [size ? size + " words" : "Loading…"])
        ]);
        grid.append(card);
      });
      levelsPanel.append(grid);

      // ── custom list: opens the picker instead of selecting a level ──
      const customN = WG.store.customWords().length;
      const customOn = s.level === "custom" && customN > 0;
      const customBadge = WG.el("span", { class: "lc-badge" }, [
        customN ? customN + (customN === 1 ? " word" : " words") : null
      ]);

      const seedInput = WG.el("input", {
        class: "lc-seed-input", type: "text", placeholder: "Paste a seed id…",
        autocomplete: "off", autocorrect: "off", autocapitalize: "off",
        spellcheck: "false", "aria-label": "Seed id"
      });
      const seedMark = WG.el("span", { class: "lc-seed-mark", "aria-hidden": "true" });

      // store the seed's words as the custom pool and select that mode
      const applySeed = got => {
        WG.store.setCustomWords(got.words);
        s.level = "custom";
        s.count = got.words.length;
        WG.store.saveSettings();
      };

      // Load → open the picker with those words already ticked, so the
      // teacher can check or edit them before playing
      const seedLoad = WG.el("button", {
        type: "button", class: "lc-load", title: "Load and review the words",
        onclick: () => {
          const got = WG.seed.decode(seedInput.value);
          if (!got) return;
          WG.sfx.play("tap");
          applySeed(got);
          ui.show("welcome");   // refresh the badge behind the popup
          WG.picker.open();
        }
      }, ["Load"]);

      // Go → start learning those words, same as the Start button
      const seedGo = WG.el("button", {
        type: "button", class: "lc-go", title: "Load and start learning",
        onclick: () => {
          const got = WG.seed.decode(seedInput.value);
          if (!got) return;
          WG.sfx.play("done");
          applySeed(got);
          WG.engine.startRound("custom", got.words.length);
          ui.show("learn");
        }
      }, ["Go"]);
      seedLoad.disabled = true;
      seedGo.disabled = true;

      const checkSeed = () => {
        const v = seedInput.value.trim();
        const ok = !!v && WG.seed.check(v);
        seedMark.textContent = v ? (ok ? "✓" : "✗") : "";
        seedMark.className = "lc-seed-mark" + (v ? (ok ? " ok" : " bad") : "");
        seedInput.classList.toggle("ok", !!v && ok);
        seedInput.classList.toggle("bad", !!v && !ok);
        seedLoad.disabled = !ok;
        seedGo.disabled = !ok;
      };
      seedInput.addEventListener("input", checkSeed);
      seedInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !seedGo.disabled) { e.preventDefault(); seedGo.click(); }
      });

      const customBtn = WG.el("div", { class: "lvl-custom" + (customOn ? " sel" : "") }, [
        WG.el("button", {
          type: "button", class: "lc-main",
          "aria-pressed": customOn ? "true" : "false",
          onclick: () => { WG.sfx.play("tap"); WG.picker.open(); }
        }, [
          WG.el("span", { class: "lc-ico", "aria-hidden": "true" }, ["✏️"]),
          WG.el("span", { class: "lc-txt" }, [
            WG.el("span", { class: "lc-title" }, ["Custom word list"]),
            WG.el("span", { class: "lc-desc" }, ["Pick your own words from the dictionary"])
          ]),
          customBadge
        ]),
        WG.el("div", { class: "lc-seed" }, [seedInput, seedMark, seedLoad, seedGo])
      ]);
      levelsPanel.append(customBtn);
      main.append(levelsPanel);

      // ── 2 · session length ──
      const sessionPanel = WG.el("section", { class: "w-panel w-session glass" }, [
        panelHead("2", "Session length", "How many words per round?")
      ]);
      const presetsEl = WG.el("div", { class: "count-presets" });
      const counterEl = WG.el("div", { class: "counter" });
      const estimateEl = WG.el("p", { class: "w-estimate" });
      sessionPanel.append(WG.el("div", { class: "w-session-body" }, [
        presetsEl, counterEl, estimateEl,
        WG.el("div", { class: "w-tip" }, [
          WG.el("span", { class: "w-tip-ico", "aria-hidden": "true" }, ["💡"]),
          WG.el("span", {}, ["A short daily round works better than one long session."])
        ])
      ]));
      col.append(sessionPanel);

      // ── 3 · hints ──
      const hintsPanel = WG.el("section", { class: "w-panel w-hints glass" }, [
        panelHead("3", "Hints", "Tap any hint to turn it on or off.")
      ]);
      const toggles = WG.el("div", { class: "hint-grid" });
      HINTS.forEach(h => {
        const on = s.hints[h.key] !== false;
        const btn = WG.el("button", {
          type: "button",
          role: "switch",
          class: "hint-tg" + (on ? " on" : " off"),
          "aria-checked": on ? "true" : "false",
          title: h.label,
          onclick: () => {
            const next = s.hints[h.key] === false;
            WG.store.setHint(h.key, next);
            WG.sfx.play("toggle");
            btn.classList.toggle("on", next);
            btn.classList.toggle("off", !next);
            btn.setAttribute("aria-checked", next ? "true" : "false");
            updateSummary();
          }
        }, [
          WG.el("span", { class: "ht-ico", "aria-hidden": "true" }, [h.icon]),
          WG.el("span", { class: "ht-label" }, [h.short || h.label]),
          WG.el("span", { class: "ht-switch", "aria-hidden": "true" }, [WG.el("i")])
        ]);
        toggles.append(btn);
      });
      hintsPanel.append(toggles);
      col.append(hintsPanel);
      main.append(col);
      mid.append(main);
      wrap.append(mid);

      // ── bottom bar: what you picked + start ──
      const sumIco = WG.el("span", { class: "w-sum-ico", "aria-hidden": "true" }, [
        WG.engine.LEVELS[s.level] ? WG.engine.LEVELS[s.level].emoji : "🚀"
      ]);
      const sumTitle = WG.el("span", { class: "w-sum-title" });
      const sumSub = WG.el("span", { class: "w-sum-sub" });

      wrap.append(WG.el("footer", { class: "w-launch glass" }, [
        WG.el("div", { class: "w-summary" }, [
          sumIco,
          WG.el("div", { class: "w-sum-txt" }, [sumTitle, sumSub])
        ]),
        WG.el("button", {
          class: "btn btn-primary btn-start",
          onclick: () => {
            WG.sfx.play("done");
            s.count = s.level === "custom" ? maxCount() : WG.clamp(s.count, 5, maxCount());
            WG.store.saveSettings();
            WG.engine.startRound(s.level, s.count);
            ui.show("learn");
          }
        }, ["Start learning ", WG.el("span", { class: "bs-arrow", "aria-hidden": "true" }, ["→"])])
      ]));

      // footnote lives at the end of the scrolling middle area
      mid.append(WG.el("p", { class: "w-note" }, [
        "Photos need internet (safe search) · Voice uses tts.xedryk.top · Everything else works offline."
      ]));

      // ── live updates ──
      const updateSummary = () => {
        const M = meta(s.level);
        if (WG.engine.LEVELS[s.level]) sumIco.textContent = WG.engine.LEVELS[s.level].emoji;
        sumTitle.textContent = M.full;
        const hintCount = HINTS.filter(h => s.hints[h.key] !== false).length;
        sumSub.textContent = s.count + " words · " + hintCount + " of " + HINTS.length + " hints on";
      };

      const setCount = v => {
        s.count = WG.clamp(v, 5, maxCount());
        WG.store.saveSettings();
        WG.sfx.play("tap");
        paintCount();
      };

      const paintCount = () => {
        const max = maxCount();
        const custom = s.level === "custom";
        s.count = custom ? max : WG.clamp(s.count, 5, max);

        presetsEl.innerHTML = "";
        counterEl.innerHTML = "";
        counterEl.classList.toggle("counter-static", custom);
        if (custom) {
          // the picked list decides the length — nothing to adjust here
          counterEl.append(WG.el("div", { class: "count-display" }, [
            WG.el("span", { class: "count-val mono" }, [String(s.count)]),
            WG.el("span", { class: "count-word" }, [s.count === 1 ? "word picked" : "words picked"])
          ]));
          estimateEl.textContent = "≈ " + Math.max(1, Math.ceil(s.count * 0.5)) + " min per round";
          updateSummary();
          return;
        }

        [5, 10, 15, 20, 30].forEach(v => {
          if (v > max) return;
          const on = s.count === v;
          presetsEl.append(WG.el("button", {
            type: "button",
            class: "preset" + (on ? " on" : ""),
            "aria-pressed": on ? "true" : "false",
            onclick: () => setCount(v)
          }, [String(v)]));
        });

        counterEl.innerHTML = "";
        counterEl.append(
          WG.el("button", {
            type: "button", class: "btn btn-ico", "aria-label": "Fewer words",
            onclick: () => setCount(s.count - 5)
          }, ["➖"]),
          WG.el("div", { class: "count-display" }, [
            WG.el("span", { class: "count-val mono" }, [String(s.count)]),
            WG.el("span", { class: "count-word" }, ["words"])
          ]),
          WG.el("button", {
            type: "button", class: "btn btn-ico", "aria-label": "More words",
            onclick: () => setCount(s.count + 5)
          }, ["➕"])
        );

        estimateEl.textContent = "≈ " + Math.max(1, Math.ceil(s.count * 0.5)) + " min per round";
        updateSummary();
      };

      paintCount();
      this.root.append(wrap);
    },

    // ═══════════════════════ shared card builder ═══════════════════════
    cardShell() {
      return WG.el("section", { class: "card glass" }, [
        WG.el("div", { class: "card-left", "data-hint": "photo" }, [
          WG.el("div", { class: "photo-area" })
        ]),
        WG.el("div", { class: "card-right" })
      ]);
    },

    renderPhoto(word) {
      const area = WG.$(".photo-area", this.root);
      if (!area) return;
      const st = S();
      area.innerHTML = "";
      if (this.hints().photo === false) return; // photo panel is off

      const shell = WG.el("div", { class: "photo-box" });
      const state = WG.el("div", { class: "photo-state loading" }, []);
      shell.append(state);
      area.append(shell);

      const showEmoji = (emoji, sub) => {
        state.className = "photo-state emoji";
        state.innerHTML = "";
        state.append(WG.el("div", { class: "big-emoji" }, [emoji || "🔤"]));
        if (sub) state.append(WG.el("div", { class: "photo-sub" }, [sub]));
      };
      const showNone = () => {
        state.className = "photo-state none";
        state.innerHTML = "";
        state.append(WG.el("div", { class: "none-ico" }, ["🖼️"]));
        state.append(WG.el("div", { class: "photo-sub" }, ["no photo for this word"]));
      };

      // ❌ / ✔️ photo controls — learn phase only
      if (st.screen === "learn") {
        const acts = WG.el("div", { class: "photo-actions" });
        const noBtn = WG.el("button", {
          class: "btn btn-ico pa-no", title: "Hide this photo / use emoji",
          onclick: async () => {
            WG.sfx.play("back");
            WG.store.setPhotoOff(word.w, true);
            await render();
          }
        }, ["❌"]);
        const reloadBtn = WG.el("button", {
          class: "btn btn-ico pa-reload", title: "Load another photo",
          onclick: async () => {
            WG.sfx.play("tap");
            const url = await WG.images.next(word);
            await render();
          }
        }, ["🔄"]);
        const okBtn = WG.el("button", {
          class: "btn btn-ico pa-ok" + (WG.store.isVerified(word.w) ? " okd" : ""),
          title: "This photo is correct for the word",
          onclick: () => {
            WG.sfx.play("correct");
            WG.store.setVerified(word.w);
            okBtn.classList.add("okd");
            shell.classList.add("verified");
          }
        }, ["✔️"]);
        acts.append(noBtn, reloadBtn, okBtn);
        area.append(acts);
      }

      const render = async () => {
        const area2 = WG.$(".photo-area", this.root);
        if (!area2) return;
        // rebuild inner (after photoOff toggle)
        ui.renderPhotoCurrent = word;
        const url = await WG.images.get(word);
        if (S().screen !== "learn" && S().screen !== "test") return;
        if (WG.$(".photo-area", ui.root) !== area2) return; // card changed
        const box = WG.$(".photo-box", area2);
        const stEl = WG.$(".photo-state", area2);
        if (!box || !stEl) return;

        if (url) {
          const ok = await WG.images.check(url);
          if (!ok) { WG.store.cacheImage(word.w, 0); word.e ? showEmoji(word.e) : showNone(); finish(box); return; }
          stEl.className = "photo-state";
          stEl.innerHTML = "";
          const img = WG.el("img", { class: "photo-img", alt: "photo for " + word.w, referrerPolicy: "no-referrer" });
          img.onload = () => img.classList.add("in");
          img.src = url;
          stEl.append(img);
        } else if (word.e) {
          showEmoji(word.e);
        } else {
          showNone();
        }
        finish(box);
      };

      const finish = box => {
        if (WG.store.isVerified(word.w)) box.classList.add("verified");
        if (WG.store.isPhotoOff(word.w)) box.classList.add("photo-disabled");
      };

      render();
      // prefetch next card's image
      const next = S().set[S().idx + 1];
      if (next) WG.images.get(next);
    },

    // ═══════════════════════ learn ═══════════════════════
    renderLearn() {
      const st = S();
      this.root.append(this.stageWithCard());
      this.root.append(this.navBar("learn"));
      st.visited[st.idx] = true;
      this.updateCard(0);
    },

    // ═══════════════════════ test ═══════════════════════
    renderTest() {
      this.root.append(this.stageWithCard("stage-test"));
      this.root.append(this.navBar("test"));
      this.updateCard(0);
    },

    // card with back / next inside its edges and the word chips along its foot
    stageWithCard(extra) {
      const card = this.cardShell();
      const dots = WG.el("div", { class: "dots" });
      this.renderDots(dots);
      card.append(
        WG.el("button", {
          class: "card-arrow ca-l", title: "Previous word (←)", "aria-label": "Previous word",
          onclick: () => ui.nav(-1)
        }, ["⬅️"]),
        WG.el("button", {
          class: "card-arrow ca-r", title: "Next word (→)", "aria-label": "Next word",
          onclick: () => ui.nav(1)
        }, ["➡️"]),
        WG.el("div", { class: "dots-row" }, [dots])
      );
      return WG.el("div", { class: "stage" + (extra ? " " + extra : "") }, [card]);
    },

    navBar(mode) {
      const st = S();
      const bar = WG.el("footer", { class: "nav" });

      const cornerL = WG.el("button", { class: "btn corner corner-l" });
      if (mode === "learn") {
        cornerL.title = "Generate new word set";
        cornerL.append(WG.el("span", { class: "cl-ico", "aria-hidden": "true" }, ["🔄"]), WG.el("span", { class: "cl-label" }, ["New words"]));
        cornerL.onclick = () => {
          WG.sfx.play("tap");
          ui.modal({
            emoji: "🔄",
            title: "New words?",
            body: "Get a fresh set of " + st.count + " words to learn. The current set will be replaced.",
            okText: "Yes, new words 🔄",
            onOk: () => { WG.engine.newSet(); ui.show("learn"); }
          });
        };
      } else if (st.review) {
        cornerL.title = "Back to results";
        cornerL.append(WG.el("span", { class: "cl-ico", "aria-hidden": "true" }, ["📊"]), WG.el("span", { class: "cl-label" }, ["Results"]));
        cornerL.onclick = () => { WG.sfx.play("tap"); ui.show("result"); };
      } else {
        cornerL.title = "Give up and see results";
        cornerL.append(WG.el("span", { class: "cl-ico", "aria-hidden": "true" }, ["🏳️"]), WG.el("span", { class: "cl-label" }, ["Give up"]));
        cornerL.onclick = () => {
          WG.sfx.play("tap");
          ui.modal({
            emoji: "🏳️",
            title: "Give up?",
            body: "Unanswered words count as wrong. See your results now?",
            okText: "See results 📊",
            onOk: () => { WG.engine.finish(); ui.show("result"); }
          });
        };
      }
      bar.append(cornerL);

      // keyboard fills the space between the two corner buttons
      bar.append(WG.el("div", { class: "nav-kb" }, [
        WG.el("div", { class: "kb-wrap" })
      ]));

      const cornerR = WG.el("button", { class: "btn corner corner-r" });
      if (mode === "learn") {
        cornerR.title = "Ready to Test";
        cornerR.classList.add("btn-test");
        cornerR.append(WG.el("span", { class: "cl-ico", "aria-hidden": "true" }, ["📝"]), WG.el("span", { class: "cl-label" }, ["Ready to Test"]));
        cornerR.onclick = () => {
          WG.sfx.play("done");
          ui.enterTestDefaults();
          WG.engine.enterTest();
          ui.show("test");
        };
      } else if (!st.review) {
        cornerR.title = "Submit answers";
        cornerR.classList.add("btn-submit");
        cornerR.append(WG.el("span", { class: "cl-ico", "aria-hidden": "true" }, ["✅"]), WG.el("span", { class: "cl-label" }, ["Submit"]));
        cornerR.onclick = () => ui.submit();
      } else {
        cornerR.classList.add("corner-spacer", "corner-blank");
        cornerR.disabled = true;
      }
      bar.append(cornerR);

      return bar;
    },

    renderDots(dotsEl) {
      const st = S();
      dotsEl = dotsEl || WG.$(".dots", this.root);
      if (!dotsEl) return;
      dotsEl.innerHTML = "";
      st.set.forEach((w, i) => {
        let cls = "dot";
        if (i === st.idx) cls += " cur";
        else if (st.screen === "test") {
          if (WG.norm(st.answers[i])) cls += " done";
        } else if (st.visited[i]) cls += " seen";
        if (st.review && st.screen === "test") {
          cls += " " + (WG.engine.isCorrect(w, st.answers[i]) ? "ok" : "bad");
        }
        dotsEl.append(WG.el("button", {
          class: cls, title: "Word " + (i + 1),
          onclick: () => { WG.sfx.play("flip"); ui.gotoCard(i); }
        }, [String(i + 1)]));
      });
    },

    nav(dir) {
      const st = S();
      const target = st.idx + dir;
      if (target < 0 || target >= st.set.length) { WG.sfx.play("tap"); return; }
      WG.sfx.play(dir > 0 ? "next" : "back");
      this.gotoCard(target);
    },

    gotoCard(i) {
      const st = S();
      // sync any pending typed answer on the current card before leaving
      const curInp = WG.$("#answer", this.root);
      if (curInp) WG.engine.setAnswer(st.idx, curInp.value);
      st.idx = WG.clamp(i, 0, st.set.length - 1);
      st.visited[st.idx] = true;
      this.renderTopbar();
      this.updateCard(i > this._lastIdx ? 1 : -1);
      this._lastIdx = st.idx;
    },

    // ═══════════════════════ learn: word + typing practice ═══════════════════════
    wordBox(w) {
      return WG.el("div", { class: "word-box" }, [
        WG.el("div", { class: "word" }, [
          WG.el("span", { class: "word-text" }, [w.w])
        ]),
        WG.el("button", {
          class: "speaker", "data-hint": "voice", title: "Listen", "aria-label": "Listen: " + w.w,
          onclick: e => { WG.sfx.play("tap"); WG.tts.speak(w.w, e.currentTarget); }
        }, ["🔊"])
      ]);
    },

    // Letter-by-letter typing pad.
    // correct letter → "ting" + green tile · whole word → chime, then reset so
    // the student can type it again · wrong letter → "beep beep" + reset.
    typePad(w) {
      const chars = w.w.split("");
      const reps = (S().reps || [])[S().idx] || 0;
      const tiles = chars.map(ch =>
        WG.el("span", { class: "tp-tile" + (ch === " " ? " sp" : ""), "aria-hidden": "true" })
      );
      const count = WG.el("span", { class: "tp-count mono" }, ["×" + reps]);
      const host = WG.el("div", { class: "type-pad" }, [
        WG.el("div", { class: "tp-tiles" }, tiles),
        WG.el("div", { class: "tp-foot" }, [
          count,
          WG.el("span", { class: "tp-hint" }, [reps ? "nice! type it again" : "type the word"])
        ])
      ]);
      this._pad = { chars, tiles, count, hint: WG.$(".tp-hint", host), pos: 0, done: reps, locked: false, host, timer: null };
      return host;
    },

    // Feed one character into the typing pad. Returns true when consumed.
    typeKey(ch) {
      const pad = this._pad;
      if (!pad || pad.locked || !ch || ch.length !== 1) return false;
      const expect = pad.chars[pad.pos];
      if (expect === undefined) return false;

      if (ch.toLowerCase() !== expect.toLowerCase()) {
        WG.sfx.play("beep");
        pad.pos = 0;
        pad.tiles.forEach(t => { t.textContent = ""; t.classList.remove("ok"); });
        pad.host.classList.remove("bad");
        void pad.host.offsetWidth;
        pad.host.classList.add("bad");
        clearTimeout(pad.badTimer);
        pad.badTimer = setTimeout(() => pad.host.classList.remove("bad"), 420);
        return true;
      }

      const tile = pad.tiles[pad.pos];
      tile.textContent = expect; // keep the word's own case (bat, Ann, …)
      tile.classList.add("ok");
      WG.sfx.play("ting", pad.pos);
      pad.pos++;

      if (pad.pos >= pad.chars.length) {
        pad.locked = true;
        pad.done++;
        pad.count.textContent = "×" + pad.done;
        if (pad.hint) pad.hint.textContent = "nice! type it again";
        const st = S();
        if (st.reps) st.reps[st.idx] = pad.done;
        pad.host.classList.add("win");
        WG.sfx.play("loop");
        clearTimeout(pad.timer);
        pad.timer = setTimeout(() => { if (ui._pad === pad) ui.typeClear(true); }, 380);
      }
      return true;
    },

    // Reset the pad to empty. keepCount keeps the "×N" repetitions badge.
    typeClear(keepCount) {
      const pad = this._pad;
      if (!pad) return;
      clearTimeout(pad.timer);
      pad.locked = false;
      pad.pos = 0;
      pad.host.classList.remove("win", "bad");
      pad.tiles.forEach(t => { t.textContent = ""; t.classList.remove("ok"); });
      if (!keepCount) {
        pad.done = 0;
        pad.count.textContent = "×0";
        if (pad.hint) pad.hint.textContent = "type the word";
        const st = S();
        if (st.reps) st.reps[st.idx] = 0;
      }
    },

    // Update the visible card (learn or test)
    updateCard(dir) {
      const st = S();
      const w = st.set[st.idx];
      if (!w) return;
      const card = WG.$(".card", this.root);
      if (!card) return;
      this._lastIdx = st.idx;
      this._pad = null;

      // slide animation
      card.classList.remove("anim-l", "anim-r");
      void card.offsetWidth;
      card.classList.add(dir >= 0 ? "anim-r" : "anim-l");

      // ── left: photo ──
      this.renderPhoto(w);

      // ── right: content ──
      const right = WG.$(".card-right", card);
      right.innerHTML = "";

      if (st.screen === "learn") {
        right.append(this.wordBox(w));
        right.append(this.typePad(w));
      } else {
        // answer box
        const ab = WG.el("div", { class: "answer-box" }, [
          WG.el("input", {
            id: "answer", class: "answer-input", type: "text",
            autocomplete: "off", autocorrect: "off", autocapitalize: "off",
            spellcheck: "false", placeholder: "type the word…",
            maxlength: 40,
            value: st.answers[st.idx] || "",
            readonly: st.review ? "readonly" : null
          }),
          WG.el("button", {
            class: "speaker", "data-hint": "voice", title: "Listen (hint)", "aria-label": "Listen",
            onclick: e => { WG.sfx.play("tap"); WG.tts.speak(w.w, e.currentTarget); }
          }, ["🔊"])
        ]);
        right.append(ab);

        if (st.review) {
          const ok = WG.engine.isCorrect(w, st.answers[st.idx]);
          const inp = WG.$("#answer", right);
          inp.classList.add(ok ? "ans-ok" : "ans-bad");
          right.append(WG.el("div", { class: "review-line " + (ok ? "ok" : "bad") }, [
            ok ? "✅ Correct!" : "❌ Answer: ",
            ok ? null : WG.el("b", {}, [w.w])
          ].filter(Boolean)));
        }

        right.append(WG.el("div", { class: "sec blanks", "data-hint": "letters" }, [
          WG.el("span", { class: "sec-ico" }, ["🔤"]),
          WG.el("span", { class: "blanks-txt mono" }, [
            WG.blanks(w.w) + "   (" + WG.letterCounts(w.w) + " letters)"
          ])
        ]));
      }

      // shared info rows — word type and the word's subject sit on one line
      right.append(WG.el("div", { class: "sec sec-pos", "data-hint": "pos" }, [
        WG.el("span", { class: "pos-chip" }, [w.t]),
        w.note ? WG.el("span", { class: "note-chip" }, [w.note]) : null
      ]));

      right.append(WG.el("div", { class: "sec sec-vn", "data-hint": "vn" }, [
        WG.el("span", { class: "sec-label" }, ["🇻🇳"]),
        WG.el("span", { class: "vn-text" }, [w.vn])
      ]));

      right.append(WG.el("div", { class: "sec", "data-hint": "en" }, [
        WG.el("span", { class: "sec-label" }, ["📖"]),
        WG.el("span", { class: "en-text" }, [w.en])
      ]));

      right.append(WG.el("div", { class: "sec sec-ex", "data-hint": "ex" }, [
        WG.el("span", { class: "sec-label" }, ["✏️"]),
        WG.el("span", { class: "ex-text", html: WG.highlight(w.ex, w.w) }),
        WG.el("button", {
          class: "speaker sm ex-say", title: "Listen to the sentence",
          "aria-label": "Listen to the example sentence",
          onclick: e => { WG.sfx.play("tap"); WG.tts.speak(w.ex, e.currentTarget); }
        }, ["🔊"])
      ]));

      this.applyHints();
      this._mountKeyboard();

      // focus & caret at end
      if (st.screen === "test" && !st.review) {
        const inp = WG.$("#answer", right);
        if (inp) {
          // Bind every handler to THIS card's index: a blur that fires while
          // the card is being replaced must not write into the next card.
          const myIdx = st.idx;
          inp.value = st.answers[myIdx] || "";   // new card → empty, answered card → its answer
          inp.addEventListener("input", () => {
            WG.engine.setAnswer(myIdx, inp.value);
            ui.renderDots();
          });
          inp.addEventListener("blur", () => {
            WG.engine.setAnswer(myIdx, inp.value);
            ui.renderDots();
          });
          inp.addEventListener("keydown", e => {
            if (e.key === "Enter") {
              e.preventDefault();
              WG.engine.setAnswer(myIdx, inp.value);
              ui.nav(1);
            }
          });
          setTimeout(() => {
            if (inp.isConnected === false) return; // card already replaced
            inp.focus();
            const v = inp.value;
            inp.setSelectionRange(v.length, v.length);
          }, 60);
        }
      }
      this.renderDots();

      // pulse "Ready to Test" when everything seen
      const rbtn = WG.$(".corner-r", this.root);
      if (rbtn && st.screen === "learn" && WG.engine.seenAll()) rbtn.classList.add("pulse");
    },

    _mountKeyboard() {
      const st = S();
      const kbWrap = WG.$(".kb-wrap", this.root);
      if (!kbWrap) return;
      if (st.review) { kbWrap.classList.add("kb-hidden"); return; }
      kbWrap.classList.remove("kb-hidden");

      // build the board once per screen — later cards only swap the answer box
      if (kbWrap.dataset.kb === st.screen) return;
      kbWrap.dataset.kb = st.screen;

      if (st.screen === "learn") {
        this.kbCtl = WG.kb.mount(kbWrap, {
          onChar: ch => ui.typeKey(ch),
          onBack: () => ui.typeClear(true),
          onEnter: () => ui.nav(1),
          onPrev: () => ui.nav(-1),
          onNext: () => ui.nav(1)
        });
        return;
      }

      this.kbCtl = WG.kb.mount(kbWrap, {
        target: () => WG.$("#answer", this.root),
        onEnter: () => { const i = WG.$("#answer", this.root); if (i) WG.engine.setAnswer(S().idx, i.value); ui.nav(1); },
        onPrev: () => ui.nav(-1),
        onNext: () => ui.nav(1)
      });
    },

    // Entering test: default hints = Vietnamese meaning only (+ photo, voice).
    // The overlay is in-memory, so the setup screen keeps what the teacher chose.
    enterTestDefaults() {
      this.testHints = Object.assign({}, WG.store.settings.hints, {
        en: false, ex: false, pos: false, letters: false
      });
    },

    submit() {
      const st = S();
      const left = st.set.length - WG.engine.answeredCount();
      WG.sfx.play("tap");
      if (left > 0) {
        ui.modal({
          emoji: "🤔",
          title: left + " word" + (left > 1 ? "s" : "") + " left",
          body: "Empty answers count as wrong. Submit anyway?",
          okText: "Submit ✅",
          onOk: () => { WG.engine.finish(); ui.show("result"); }
        });
      } else {
        WG.engine.finish();
        ui.show("result");
      }
    },

    // ═══════════════════════ result ═══════════════════════
    renderResult() {
      const st = S();
      const sc = WG.engine.score();

      const wrap = WG.el("div", { class: "result" });

      // score header
      const head = WG.el("div", { class: "res-head glass" });
      const R = 62, C = 2 * Math.PI * R;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "ring"); svg.setAttribute("viewBox", "0 0 150 150");
      svg.innerHTML =
        '<circle class="ring-bg" cx="75" cy="75" r="' + R + '"/>' +
        '<circle class="ring-fg" cx="75" cy="75" r="' + R + '" stroke-dasharray="' + C + '"/>';
      const num = WG.el("div", { class: "ring-num" }, ["0%"]);
      const ringWrap = WG.el("div", { class: "ring-wrap" }, [svg, num]);
      const msg = sc.pct === 100 ? "🏆 Perfect!" :
                  sc.pct >= 80 ? "🌟 Amazing!" :
                  sc.pct >= 50 ? "👍 Good job!" : "💪 Keep trying!";
      head.append(ringWrap,
        WG.el("div", { class: "res-info" }, [
          WG.el("h2", { class: "res-msg" }, [msg]),
          WG.el("p", { class: "res-sub" }, [
            sc.correct + " of " + sc.total + " correct · " +
            WG.engine.levelInfo(st.level).name.replace(" — All levels", "")
          ])
        ]));

      // buttons
      const acts = WG.el("div", { class: "res-acts" });
      acts.append(
        WG.el("button", {
          class: "btn", title: "Retry the same words",
          onclick: () => { WG.sfx.play("tap"); WG.engine.retry(); ui.show("test"); }
        }, ["🔁", WG.el("span", { class: "cl-label" }, ["Retry"])]),
        WG.el("button", {
          class: "btn", title: "Review your answers",
          onclick: () => { WG.sfx.play("tap"); WG.engine.enterReview(); ui.show("test"); }
        }, ["👀", WG.el("span", { class: "cl-label" }, ["Review"])]),
        WG.el("button", {
          class: "btn", title: "Learn a new word set",
          onclick: () => { WG.sfx.play("tap"); WG.engine.newSet(); ui.show("learn"); }
        }, ["🆕", WG.el("span", { class: "cl-label" }, ["New words"])]),
        WG.el("button", {
          class: "btn", title: "Back to setup",
          onclick: () => { WG.sfx.play("tap"); ui.show("welcome"); }
        }, ["⚙️", WG.el("span", { class: "cl-label" }, ["Setup"])])
      );
      head.append(acts);
      wrap.append(head);

      // table
      const table = WG.el("div", { class: "res-table glass" });
      sc.rows.forEach((r, i) => {
        const w = r.word;
        const row = WG.el("div", { class: "res-row " + (r.correct ? "ok" : "bad") });
        row.append(
          WG.el("button", {
            class: "btn btn-ico speaker sm", title: "Listen: " + w.w,
            onclick: e => { WG.sfx.play("tap"); WG.tts.speak(w.w, e.currentTarget); }
          }, ["🔊"]),
          WG.el("div", { class: "rr-word" }, [
            WG.el("div", { class: "rr-w" }, [w.w]),
            WG.el("div", { class: "rr-pos" }, [w.t])
          ]),
          WG.el("div", { class: "rr-ans" }, [
            WG.el("div", { class: "rr-input" }, [r.input || "—"]),
            WG.el("div", { class: "rr-mark" }, [r.correct ? "✅" : "❌"])
          ]),
          WG.el("div", { class: "rr-vn" }, [w.vn]),
          WG.el("div", { class: "rr-en" }, [
            WG.el("div", { class: "en-text" }, [w.en]),
            WG.el("div", { class: "ex-text", html: WG.highlight(w.ex, w.w) })
          ])
        );
        row.style.animationDelay = Math.min(i * 40, 400) + "ms";
        table.append(row);
      });
      wrap.append(table);
      this.root.append(wrap);

      // animate ring + number
      requestAnimationFrame(() => {
        const fg = WG.$(".ring-fg", this.root);
        if (fg) {
          fg.style.strokeDashoffset = C;
          requestAnimationFrame(() => {
            fg.style.transition = "stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)";
            fg.style.strokeDashoffset = C * (1 - sc.pct / 100);
          });
        }
        const t0 = performance.now();
        const tick = t => {
          const k = Math.min(1, (t - t0) / 1100);
          num.textContent = Math.round(sc.pct * (1 - Math.pow(1 - k, 3))) + "%";
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      if (sc.pct >= 80) {
        WG.sfx.play("fanfare");
        this.confetti();
      } else {
        WG.sfx.play("done");
      }
    },

    // ═══════════════════════ modal ═══════════════════════
    modal(opts) {
      const root = WG.$("#modal-root");
      root.innerHTML = "";
      const back = WG.el("div", { class: "modal-back" });
      const box = WG.el("div", { class: "modal glass" }, [
        WG.el("div", { class: "m-emoji" }, [opts.emoji || "❓"]),
        WG.el("h3", {}, [opts.title || ""]),
        WG.el("p", { class: "m-body" }, [opts.body || ""]),
        WG.el("div", { class: "m-acts" }, [
          WG.el("button", { class: "btn", onclick: close }, [opts.cancelText || "Cancel"]),
          WG.el("button", {
            class: "btn btn-primary",
            onclick: () => { close(); if (opts.onOk) opts.onOk(); }
          }, [opts.okText || "OK"])
        ])
      ]);
      back.append(box);
      root.append(back);
      requestAnimationFrame(() => back.classList.add("in"));
      function close() {
        WG.sfx.play("tap");
        back.classList.remove("in");
        setTimeout(() => { root.innerHTML = ""; }, 180);
      }
      back.addEventListener("click", e => { if (e.target === back) close(); });
    },

    // ═══════════════════════ confetti ═══════════════════════
    confetti() {
      const cv = WG.$("#confetti");
      const ctx = cv.getContext("2d");
      cv.width = innerWidth; cv.height = innerHeight;
      cv.classList.add("go");
      const colors = ["#5b7cfa", "#7c8cff", "#22b573", "#f4d35e", "#ffffff"];
      const parts = [];
      for (let i = 0; i < 140; i++) {
        parts.push({
          x: Math.random() * cv.width,
          y: -20 - Math.random() * cv.height * 0.4,
          w: 5 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          vy: 2.2 + Math.random() * 3,
          vx: -1.2 + Math.random() * 2.4,
          rot: Math.random() * Math.PI,
          vr: -0.12 + Math.random() * 0.24,
          c: colors[i % colors.length]
        });
      }
      const t0 = performance.now();
      const frame = t => {
        const el = t - t0;
        ctx.clearRect(0, 0, cv.width, cv.height);
        parts.forEach(p => {
          p.x += p.vx; p.y += p.vy; p.rot += p.vr;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.c;
          ctx.globalAlpha = el > 2200 ? Math.max(0, 1 - (el - 2200) / 600) : 0.9;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        });
        if (el < 2900) requestAnimationFrame(frame);
        else { ctx.clearRect(0, 0, cv.width, cv.height); cv.classList.remove("go"); }
      };
      requestAnimationFrame(frame);
    }
  };

  WG.ui = ui;
})();
