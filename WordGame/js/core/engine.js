// Game engine: word pools, set generation, answer checking, scoring.
window.WG = window.WG || {};
(function () {
  const D = window.WG_DATA || {};

  const LEVELS = {
    prea1:     { key: "PREA1", name: "Pre-A1 Starters", emoji: "🐣", pool: () => D.PREA1 || [] },
    a1:        { key: "A1",    name: "A1 Movers",       emoji: "🐥", pool: () => D.A1 || [] },
    a2:        { key: "A2",    name: "A2 Flyers",       emoji: "🦅", pool: () => D.A2 || [] },
    challenge: { key: "CH",    name: "Challenge — All levels", emoji: "🏆",
                 pool: () => [].concat(D.PREA1 || [], D.A1 || [], D.A2 || []) },
    // teacher-built list; the pool is whatever was picked in the custom picker
    custom:    { key: "CUSTOM", name: "Custom word list", emoji: "✏️",
                 pool: () => WG.store.customWords() }
  };

  const state = {
    screen: "welcome",     // welcome | learn | test | result
    level: "prea1",
    count: 10,
    set: [],               // array of word records for this round
    idx: 0,
    answers: [],           // student input per card
    visited: [],           // cards seen in learn phase
    reps: [],              // times each word was typed correctly in learn
    review: false,         // result review mode (locked test view)
    submitted: false
  };

  // Split a Vietnamese gloss such as "cô ấy, chị ấy" into its meanings.
  // Diacritics are significant here (má / mà / mã), so never use WG.norm().
  function glosses(vn) {
    return String(vn || "")
      .normalize("NFC")
      .toLowerCase()
      .split(/[;,]/)
      .map(s => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  // Two words share a meaning when one gloss list is contained in the other,
  // e.g. "lớn" and "to, lớn", or "ông" and "ông".
  function sameMeaning(a, b) {
    const ga = glosses(a.vn);
    const gb = glosses(b.vn);
    const [small, big] = ga.length <= gb.length ? [ga, gb] : [gb, ga];
    return small.length > 0 && small.every(g => big.includes(g));
  }

  function pickSet(level, count) {
    const pool = LEVELS[level].pool();
    const shuffled = WG.shuffle(pool);
    const want = Math.max(1, count);
    const picked = [];
    for (const word of shuffled) {
      if (picked.some(p => sameMeaning(p, word))) continue;
      picked.push(word);
      if (picked.length >= want) break;
    }
    return picked;
  }

  // Test order is always a fresh shuffle so it never mirrors the learn order.
  // answers/visited/reps are indexed by card position, so they reset with it.
  function shuffleForTest() {
    state.set = WG.shuffle(state.set);
    state.answers = new Array(state.set.length).fill("");
    state.visited = new Array(state.set.length).fill(false);
    state.reps = new Array(state.set.length).fill(0);
    state.idx = 0;
  }

  function isCorrect(word, input) {
    const n = WG.norm(input);
    if (!n) return false;
    if (n === WG.norm(word.w)) return true;
    return (word.a || []).some(alt => n === WG.norm(alt));
  }

  WG.engine = {
    LEVELS,
    state,

    poolSize(level) { return LEVELS[level].pool().length; },
    levelInfo(level) { return LEVELS[level]; },

    startRound(level, count) {
      state.level = level;
      state.count = count;
      state.set = pickSet(level, count);
      state.idx = 0;
      state.answers = new Array(state.set.length).fill("");
      state.visited = new Array(state.set.length).fill(false);
      state.reps = new Array(state.set.length).fill(0);
      state.review = false;
      state.submitted = false;
      state.screen = "learn";
    },

    // "Generate new words" / "Learn new words" — fresh set, back to learn
    newSet() {
      this.startRound(state.level, state.count);
    },

    retry() {
      shuffleForTest();
      state.review = false;
      state.submitted = false;
      state.screen = "test";
    },

    enterTest() {
      shuffleForTest();
      state.review = false;
      state.screen = "test";
    },

    enterReview() {
      state.idx = 0;
      state.review = true;
      state.screen = "test";
    },

    goto(i) {
      const dir = i > state.idx ? 1 : -1;
      state.idx = WG.clamp(i, 0, state.set.length - 1);
      state.visited[state.idx] = true;
      return dir;
    },

    setAnswer(i, val) { state.answers[i] = val; },
    answeredCount() { return state.answers.filter(a => WG.norm(a)).length; },
    seenAll() { return state.visited.every(v => v); },

    isCorrect,

    score() {
      const rows = state.set.map((w, i) => ({
        word: w,
        input: state.answers[i] || "",
        correct: isCorrect(w, state.answers[i])
      }));
      const correct = rows.filter(r => r.correct).length;
      const total = rows.length;
      return { rows, correct, total, pct: total ? Math.round(correct / total * 100) : 0 };
    },

    finish() {
      state.submitted = true;
      state.screen = "result";
    }
  };
})();
