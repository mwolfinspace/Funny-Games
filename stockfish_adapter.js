// stockfish_adapter.js
// Lightweight adapter over a Stockfish WASM build for browser chess UIs.
// Usage: create StockfishAdapter({engineUrl: '...optional...'}) and call setLevel(1..4), getBestMove(fen,...).
// License: follow Stockfish license (GPL). Make sure to include the stockfish binary from a compatible distribution.

class StockfishAdapter {
  constructor(opts = {}) {
    this.engine = null;
    this.queue = [];
    this.ready = false;
    this.listeners = [];
    this.lastId = 0;

    // default urls (CDN builds). You can override engineWorkerUrl if you host engine locally.
    this.engineWorkerUrl = opts.engineWorkerUrl || null;
    // If a global Stockfish() factory exists (stockfish.js), we'll use that.
    this.onLog = opts.onLog || (() => {});
    this.defaultTimeMs = opts.defaultTimeMs || 1000; // default movetime
    this.init();
  }

  async init() {
    // Create engine as Worker or via global Stockfish() factory if present
    try {
      if (typeof Stockfish === 'function') {
        // some builds expose Stockfish() to create a worker-like object
        this.engine = Stockfish();
      } else if (this.engineWorkerUrl) {
        this.engine = new Worker(this.engineWorkerUrl);
      } else {
        // Fallback: try common CDN location (stockfish.wasm package)
        // NOTE: user can override engineWorkerUrl to the proper worker path in their environment.
        const fallback = 'https://cdn.jsdelivr.net/npm/stockfish.wasm/stockfish.worker.js';
        this.engine = new Worker(fallback);
      }
    } catch (e) {
      console.error('Failed to instantiate Stockfish engine. Provide engineWorkerUrl or include stockfish.js build.', e);
      throw e;
    }

    // wire message handler
    this.engine.onmessage = (ev) => this._onMessage(ev.data || ev);
    this.ready = true;
    this._post('uci');
    this._post('isready');
  }

  _post(cmd) {
    try {
      // some builds use postMessage string, others expect object - stockfish uses postMessage(string)
      this.onLog('> ' + cmd);
      if (this.engine.postMessage) {
        this.engine.postMessage(cmd);
      } else if (typeof this.engine === 'function') {
        this.engine(cmd);
      } else {
        console.warn('Engine does not support postMessage or function call.');
      }
    } catch (e) {
      console.error('engine post failed', e);
    }
  }

  _onMessage(msg) {
    // engine sometimes sends object or string
    const text = (typeof msg === 'string') ? msg : (msg.data || JSON.stringify(msg));
    this.onLog('< ' + text);

    // isready replies "readyok"
    if (text.indexOf('readyok') !== -1) {
      // engine ready
    }

    // bestmove handling
    const bm = text.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
    if (bm) {
      // resolve earliest queued request
      const q = this.queue.shift();
      if (q) q.resolve({ move: bm[1], raw: text });
      return;
    }

    // optionally pass other info lines to listeners
    this.listeners.forEach(fn => {
      try { fn(text); } catch (e) { /*ignore*/ }
    });
  }

  onInfo(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(x => x !== fn);
    };
  }

  /**
   * Map your 4 AI levels to target Elo (approximate).
   * You can adjust these numbers if you want the engine a bit stronger/weaker.
   *
   * Suggested defaults (midpoints / safe):
   *  Level 1 -> 2100  (expert/national candidate master region)
   *  Level 2 -> 2350  (FIDE master region)
   *  Level 3 -> 2450  (International Master region)
   *  Level 4 -> 2600  (Grandmaster region)
   */
  static levelToElo(level) {
    // AI 1: <2400 (e.g., 2200)
    // AI 2: 2401-2500 (e.g., 2450)
    // AI 3: 2501-2600 (e.g., 2550)
    // AI 4: >2600 (e.g., 2700)
    const map = {1: 2200, 2: 2450, 3: 2550, 4: 2700};
    return map[level] || 2200;
  }

  /**
   * Optionally set a stockfish Skill Level fallback (0-20).
   * This is approximate; we prefer UCI_LimitStrength + UCI_Elo when available.
   */
  static eloToSkill(elo) {
    // linear approximate mapping between Elo 1100 -> skill 0 and 3500 -> skill 20
    const minE = 1100, maxE = 3500;
    let s = Math.round((elo - minE) / (maxE - minE) * 20);
    if (s < 0) s = 0;
    if (s > 20) s = 20;
    return s;
  }

  /**
   * setLevel(levelNumber)
   * levelNumber: 1..4 as you specified
   * This will set UCI options: UCI_LimitStrength true, UCI_Elo = mapped Elo, and Skill Level as precaution.
   */
  setLevel(levelNumber = 1) {
    const elo = StockfishAdapter.levelToElo(levelNumber);
    const skill = StockfishAdapter.eloToSkill(elo);

    // Prefer using UCI_LimitStrength + UCI_Elo (Stockfish supports these options).
    this._post(`setoption name UCI_LimitStrength value true`);
    this._post(`setoption name UCI_Elo value ${elo}`);

    // Also set Skill Level as a fallback to influence move selection randomness on some builds
    this._post(`setoption name Skill Level value ${skill}`);

    // tune threads & hash optionally
    this._post(`setoption name Threads value 1`);
    this._post(`setoption name Hash value 64`);

    // reinitialize internal engine state if needed
    this._post('isready');
    return { elo, skill };
  }

  /**
   * getBestMove(fen, opts)
   * opts: { movetime: ms, depth: n, ponder: bool }
   * Returns a Promise resolving to { move: 'e2e4', raw: 'bestmove e2e4 ponder ...' }
   */
  getBestMove(fen, opts = {}) {
    if (!this.ready) return Promise.reject(new Error('engine-not-ready'));

    const movetime = (opts.movetime != null) ? opts.movetime : this.defaultTimeMs;

    return new Promise((resolve, reject) => {
      // keep a small queue so responses pair with promises
      this.queue.push({ resolve, reject });

      // Set position and start search
      this._post(`position fen ${fen}`);
      if (opts.depth && Number.isInteger(opts.depth)) {
        this._post(`go depth ${opts.depth}`);
      } else {
        this._post(`go movetime ${movetime}`);
      }

      // safety: if engine doesn't respond in reasonable time, reject
      const id = ++this.lastId;
      const timeout = setTimeout(() => {
        // find and remove this promise from queue if still there
        const idx = this.queue.findIndex(q => q.resolve === resolve);
        if (idx >= 0) this.queue.splice(idx, 1);
        reject(new Error('timeout-getBestMove'));
      }, (movetime * 3) + 2000);

      // wrap resolve to clear timeout
      const origResolve = resolve;
      resolve = (val) => {
        clearTimeout(timeout);
        try { origResolve(val); } catch (e) {}
      };
    });
  }

  // Stop or quit engine
  stop() {
    try {
      this._post('stop');
    } catch(e){/*ignore*/}
  }

  quit() {
    try {
      this._post('quit');
      if (this.engine && this.engine.terminate) this.engine.terminate();
    } catch (e) { /*ignore*/ }
  }
}

// Export for usage in browser modules or as global
if (typeof window !== 'undefined') window.StockfishAdapter = StockfishAdapter;
if (typeof module !== 'undefined') module.exports = StockfishAdapter;